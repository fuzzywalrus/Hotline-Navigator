import SwiftUI
import SceneKit

class LogoSceneController {
  var spinNode: SCNNode?
  private var decelerationTimer: Timer?
  private static let spinKey = "autoSpin"

  func beginDrag() {
    self.decelerationTimer?.invalidate()
    self.spinNode?.removeAction(forKey: Self.spinKey)
  }

  func drag(deltaX: CGFloat) {
    self.spinNode?.eulerAngles.y += CGFloat(deltaX * 0.01)
  }

  func endDrag(velocity: CGFloat) {
    var clampedVelocity = max(-1500, min(1500, velocity))
    let autoSpinVelocity: CGFloat = (.pi * 2) / (8.0 * 0.01)
    let blendRate: CGFloat = 0.06
    let interval: TimeInterval = 1.0 / 60.0

    self.decelerationTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { [weak self] timer in
      guard let self = self, let spinNode = self.spinNode else {
        timer.invalidate()
        return
      }

      clampedVelocity += (autoSpinVelocity - clampedVelocity) * blendRate
      spinNode.eulerAngles.y += CGFloat(clampedVelocity * CGFloat(interval) * 0.01)

      if abs(clampedVelocity - autoSpinVelocity) < 1.0 {
        timer.invalidate()
        self.startAutoSpin()
      }
    }
  }

  func startAutoSpin() {
    let spin = SCNAction.repeatForever(
      SCNAction.rotateBy(x: 0, y: .pi * 2, z: 0, duration: 8)
    )
    self.spinNode?.runAction(spin, forKey: Self.spinKey)
  }

  func startWithFastSpin() {
    let autoSpinVelocity: CGFloat = (.pi * 2) / (8.0 * 0.01)
    let initialVelocity: CGFloat = autoSpinVelocity * 4.0
    let blendRate: CGFloat = 0.04
    let interval: TimeInterval = 1.0 / 60.0

    var currentVelocity = initialVelocity

    self.decelerationTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { [weak self] timer in
      guard let self = self, let spinNode = self.spinNode else {
        timer.invalidate()
        return
      }

      currentVelocity += (autoSpinVelocity - currentVelocity) * blendRate
      spinNode.eulerAngles.y += CGFloat(currentVelocity * CGFloat(interval) * 0.01)

      if abs(currentVelocity - autoSpinVelocity) < 1.0 {
        timer.invalidate()
        self.startAutoSpin()
      }
    }
  }
}

struct NonDraggableArea: NSViewRepresentable {
  func makeNSView(context: Context) -> NSView {
    let view = NonDraggableNSView()
    view.wantsLayer = true
    view.layer?.backgroundColor = .clear
    return view
  }
  func updateNSView(_ nsView: NSView, context: Context) {}
}

class NonDraggableNSView: NSView {
  override var mouseDownCanMoveWindow: Bool { false }
}

struct SpinningLogoView: NSViewRepresentable {
  let controller: LogoSceneController

  func makeNSView(context: Context) -> SCNView {
    let scnView = SCNView()
    scnView.backgroundColor = .clear
    scnView.allowsCameraControl = false
    scnView.autoenablesDefaultLighting = false
    scnView.antialiasingMode = .multisampling4X

    guard let url = Bundle.main.url(forResource: "Logo", withExtension: "obj"),
          let scene = try? SCNScene(url: url) else {
      return scnView
    }
    scene.background.contents = NSColor.clear
    scnView.scene = scene

    // Reparent model nodes into a container so we can fix orientation
    let containerNode = SCNNode()
    let modelNodes = scene.rootNode.childNodes.filter { $0.light == nil }
    for node in modelNodes {
      node.removeFromParentNode()
      containerNode.addChildNode(node)
    }
    // Stand the model upright (OBJ is flat on XZ plane)
    containerNode.eulerAngles.x = -.pi / 2

    let spinNode = SCNNode()
    spinNode.addChildNode(containerNode)
    scene.rootNode.addChildNode(spinNode)
    self.controller.spinNode = spinNode

    // Apply white material with custom shading
    containerNode.enumerateChildNodes { node, _ in
      if let geometry = node.geometry {
        let material = SCNMaterial()
        material.diffuse.contents = NSColor.white
        material.lightingModel = .constant
        material.shaderModifiers = [
          .fragment: """
            vec3 viewDir = normalize(scn_frame.inverseViewTransform[3].xyz - _surface.position);
            vec3 envRed = vec3(0.882, 0.0, 0.0);
            vec3 darkRed = vec3(0.03, 0.0, 0.0);

            // Directional light
            vec3 lightDir = normalize(vec3(0.0, 0.3, 1.0));
            float NdotL = max(dot(_surface.normal, lightDir), 0.0);
            float lighting = smoothstep(0.0, 0.8, NdotL);

            // Vertical gradient — subtle darkening toward the bottom
            float height = _surface.position.y;
            float verticalFade = smoothstep(-2.0, 2.0, height);
            lighting *= mix(0.92, 1.0, verticalFade);

            // Fresnel — plastic reflects strongly at glancing angles
            float fresnel = 1.0 - max(dot(_surface.normal, viewDir), 0.0);
            float fresnelSharp = pow(fresnel, 3.0);
            float fresnelSoft = pow(fresnel, 1.5);

            // Ambient red from environment — even lit areas pick up warmth
            vec3 ambient = envRed * 0.08;

            // Base: lit areas are tinted white, unlit areas are dark red
            vec3 baseColor = mix(darkRed, vec3(1.0), lighting) + ambient;

            // Tint lower areas with environment red
            float redTint = (1.0 - verticalFade) * 0.65;
            baseColor = mix(baseColor, envRed, redTint * lighting);

            // Environment red at edges (fresnel reflection)
            baseColor = mix(baseColor, envRed, fresnelSharp * 0.8);

            // Broad plastic sheen — soft diffuse highlight
            vec3 halfVec = normalize(lightDir + viewDir);
            float sheen = pow(max(dot(_surface.normal, halfVec), 0.0), 6.0);
            baseColor += vec3(1.0) * sheen * 0.15;

            // Subtle specular — not too shiny
            float spec = pow(max(dot(_surface.normal, halfVec), 0.0), 50.0);
            baseColor += vec3(1.0) * spec * 0.25;

            // Soft rim light — plastic catches environment at edges
            baseColor += envRed * fresnelSoft * 0.1;

            _output.color.rgb = baseColor;
          """
        ]
        geometry.materials = [material]
      }
    }

    // Start with a fast spin that decelerates to natural speed
    self.controller.startWithFastSpin()

    // Camera — pulled back to avoid clipping
    let cameraNode = SCNNode()
    cameraNode.camera = SCNCamera()
    cameraNode.camera!.fieldOfView = 65
    cameraNode.position = SCNVector3(0, 0, 6)
    cameraNode.look(at: SCNVector3Zero)
    scene.rootNode.addChildNode(cameraNode)
    scnView.pointOfView = cameraNode

    // Directional light from camera direction
    let directionalLight = SCNNode()
    directionalLight.light = SCNLight()
    directionalLight.light!.type = .directional
    directionalLight.light!.intensity = 1000
    directionalLight.light!.color = NSColor.white
    directionalLight.eulerAngles = SCNVector3(0, 0, 0)
    scene.rootNode.addChildNode(directionalLight)

    return scnView
  }

  func updateNSView(_ nsView: SCNView, context: Context) {}
}

struct InteractiveSpinningLogo: View {
  @State var controller = LogoSceneController()
  @State private var lastDragX: CGFloat = 0
  @State private var lastDragTime: TimeInterval = 0
  @State private var dragVelocity: CGFloat = 0

  var height: CGFloat = 220

  var body: some View {
    SpinningLogoView(controller: self.controller)
      .frame(height: self.height)
      .overlay {
        NonDraggableArea()
      }
      .gesture(
        DragGesture(minimumDistance: 0)
          .onChanged { value in
            let now = ProcessInfo.processInfo.systemUptime
            let dt = now - self.lastDragTime
            if dt > 0 && self.lastDragTime > 0 {
              self.dragVelocity = (value.location.x - self.lastDragX) / CGFloat(dt)
            }
            let deltaX = value.location.x - self.lastDragX
            if self.lastDragX != 0 {
              self.controller.drag(deltaX: deltaX)
            } else {
              self.controller.beginDrag()
            }
            self.lastDragX = value.location.x
            self.lastDragTime = now
          }
          .onEnded { _ in
            self.controller.endDrag(velocity: self.dragVelocity)
            self.lastDragX = 0
            self.lastDragTime = 0
            self.dragVelocity = 0
          }
      )
  }
}
