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
            vec3 darkRed = vec3(0.14, 0.0, 0.0);

            // Directional light
            vec3 lightDir = normalize(vec3(0.3, 0.5, 1.0));
            float NdotL = max(dot(_surface.normal, lightDir), 0.0);
            float lighting = smoothstep(0.0, 1.0, NdotL);

            // Fresnel — edges pick up environment red
            float fresnel = 1.0 - max(dot(_surface.normal, viewDir), 0.0);
            fresnel = pow(fresnel, 2.0);

            // Base: lit areas are white, unlit areas are dark red
            vec3 baseColor = mix(darkRed, vec3(1.0), lighting);

            // Blend in environment red at edges
            baseColor = mix(baseColor, envRed, fresnel * 0.7);

            // Specular glint
            vec3 halfVec = normalize(lightDir + viewDir);
            float spec = pow(max(dot(_surface.normal, halfVec), 0.0), 60.0);
            baseColor += vec3(1.0) * spec * 0.4;

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
    cameraNode.camera!.fieldOfView = 40
    cameraNode.position = SCNVector3(0, 0, 10)
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

struct OnboardingView: View {
  @Environment(\.dismissWindow) private var dismissWindow
  @Environment(\.openWindow) private var openWindow

  @State private var logoController = LogoSceneController()
  @State private var lastDragX: CGFloat = 0
  @State private var lastDragTime: TimeInterval = 0
  @State private var dragVelocity: CGFloat = 0
  @State private var step: Int = 0
  @State private var username: String = Prefs.shared.username == "guest" ? "" : Prefs.shared.username
  @State private var selectedIconID: Int = Prefs.shared.userIconID
  @State private var hoveredIconID: Int = -1
  @State private var showUsernameAlert: Bool = false
  @State private var canScrollUp: Bool = false
  @State private var canScrollDown: Bool = true
  @State private var scrolledToIcon: Bool = false

  private let totalSteps = 3

  var body: some View {
    VStack(spacing: 0) {
      Spacer()

      Group {
        switch self.step {
        case 0:
          self.welcomeStep
            .transition(.asymmetric(
              insertion: .move(edge: .trailing).combined(with: .opacity),
              removal: .move(edge: .leading).combined(with: .opacity)
            ))
        case 1:
          self.serversStep
            .transition(.asymmetric(
              insertion: .move(edge: .trailing).combined(with: .opacity),
              removal: .move(edge: .leading).combined(with: .opacity)
            ))
        case 2:
          self.identityStep
            .transition(.asymmetric(
              insertion: .move(edge: .trailing).combined(with: .opacity),
              removal: .move(edge: .leading).combined(with: .opacity)
            ))
        default:
          EmptyView()
        }
      }
      .id(self.step)

      Spacer()

      self.navigationArea
        .padding(.bottom, 24)
    }
    .frame(width: 480, height: 520)
    .background {
      Color.hotlineRed.ignoresSafeArea()
      RadialGradient(
        colors: [.black.opacity(0), .black.opacity(0.5)],
        center: .center,
        startRadius: 0,
        endRadius: 250
      )
      .blendMode(.softLight)
      .ignoresSafeArea()
    }
    .windowFullScreenBehavior(.disabled)
    .toolbar(removing: .title)
    .alert("Choose a Nickname", isPresented: self.$showUsernameAlert) {
      Button("OK", role: .cancel) {}
    } message: {
      Text("Please type-in a nickname for yourself before you continue.")
    }
    .background(
      WindowConfigurator { window in
        window.titlebarAppearsTransparent = true
        window.titlebarSeparatorStyle = .none
        window.isMovableByWindowBackground = true
        if let btn = window.standardWindowButton(.closeButton) {
          btn.isHidden = true
        }
        if let btn = window.standardWindowButton(.zoomButton) {
          btn.isHidden = true
        }
        if let btn = window.standardWindowButton(.miniaturizeButton) {
          btn.isHidden = true
        }
      }
    )
  }

  // MARK: - Steps

  private var welcomeStep: some View {
    VStack(spacing: 0) {
      SpinningLogoView(controller: self.logoController)
        .frame(width: 200, height: 350)
        .overlay(NonDraggableArea())
        .pointerStyle(.grabIdle)
        .gesture(
          DragGesture(minimumDistance: 2)
            .onChanged { value in
              let now = CACurrentMediaTime()
              let dt = now - self.lastDragTime
              let deltaX = value.translation.width - self.lastDragX

              if self.lastDragX == 0 && self.lastDragTime == 0 {
                // First drag event
                self.logoController.beginDrag()
              }

              self.logoController.drag(deltaX: deltaX)

              if dt > 0 {
                let instantVelocity = deltaX / CGFloat(dt)
                self.dragVelocity = self.dragVelocity * 0.1 + instantVelocity * 0.9
              }

              self.lastDragX = value.translation.width
              self.lastDragTime = now
            }
            .onEnded { _ in
              self.logoController.endDrag(velocity: self.dragVelocity)
              self.lastDragX = 0
              self.lastDragTime = 0
              self.dragVelocity = 0
            }
        )

//      Text("Welcome to Hotline")
//        .font(.system(size: 24))
//        .fontWeight(.semibold)
//        .kerning(-1.0)
//        .foregroundStyle(.white)
    }
  }

  private var serversStep: some View {
    VStack(alignment: .leading, spacing: 16) {
      Image(systemName: "globe.americas.fill")
        .resizable()
        .scaledToFit()
        .frame(width: 48, height: 48)
        .foregroundStyle(.white.opacity(0.85))

      Text("What is Hotline?")
        .font(.system(size: 24))
        .fontWeight(.bold)
        .kerning(-0.5)
        .foregroundStyle(.white)

      Text("""
          Hotline is a network of internet communities run by individuals like yourself all over the world. Spaces where people chat, share files, and post thoughts together in newsgroups.
          
          These communities are tracked and made discoverable through Hotline Trackers which are also run by individuals.
          
          No company owns this. No subscriptions or ads.
          Simple and free. It's Hotline.
          """)
        .font(.system(size: 15))
        .foregroundStyle(.white.opacity(0.7))
        .multilineTextAlignment(.leading)
        .lineSpacing(3)
    }
    .padding(.horizontal, 48)
  }

  private var identityStep: some View {
    VStack(spacing: 16) {
      Text("Your Identity")
        .font(.system(size: 24))
        .fontWeight(.bold)
        .kerning(-0.5)
        .foregroundStyle(.white)

      Text("Choose a nickname and icon to represent\nyourself to others on Hotline.")
        .font(.system(size: 15))
        .foregroundStyle(.white.opacity(0.7))
        .multilineTextAlignment(.center)
        .lineSpacing(3)

      TextField("", text: self.$username, prompt: Text("Nickname").foregroundStyle(.white.opacity(0.3)))
        .textFieldStyle(.plain)
        .font(.system(size: 15))
        .foregroundStyle(.white)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
          RoundedRectangle(cornerRadius: 8)
            .fill(.white.opacity(0.15))
        )
        .frame(maxWidth: 220)
        .multilineTextAlignment(.center)
        .padding(.top, 4)

      ScrollViewReader { proxy in
        ScrollView {
          LazyVGrid(columns: [GridItem(.adaptive(minimum: 40), spacing: 0)], spacing: 0) {
            ForEach(HotlineState.classicIconSet, id: \.self) { iconID in
              Image("Classic/\(iconID)")
                .resizable()
                .interpolation(.none)
                .scaledToFit()
                .frame(width: 32, height: 16)
                .frame(width: 32, height: 32)
                .padding(4)
                .background(
                  RoundedRectangle(cornerRadius: 5)
                    .fill(iconID == self.hoveredIconID ? .white.opacity(0.15) : .clear)
                )
                .overlay(
                  RoundedRectangle(cornerRadius: 5)
                    .strokeBorder(iconID == self.selectedIconID ? .white : .clear, lineWidth: 2)
                )
                .contentShape(Rectangle())
                .id(iconID)
                .onTapGesture {
                  self.selectedIconID = iconID
                }
                .onHover { hovered in
                  if hovered {
                    self.hoveredIconID = iconID
                  }
                }
            }
          }
          .padding(.horizontal, 4)
        }
        .onAppear {
          if !self.scrolledToIcon {
            self.scrolledToIcon = true
            proxy.scrollTo(self.selectedIconID, anchor: .center)
          }
        }
      }
      .frame(maxWidth: 360, maxHeight: 230)
      .scrollContentBackground(.hidden)
      .onScrollGeometryChange(for: Bool.self) { geo in
        geo.contentOffset.y > geo.contentInsets.top + 1
      } action: { _, canUp in
        self.canScrollUp = canUp
      }
      .onScrollGeometryChange(for: Bool.self) { geo in
        let maxOffset = geo.contentSize.height - geo.containerSize.height + geo.contentInsets.top + geo.contentInsets.bottom
        return geo.contentOffset.y < maxOffset - 1
      } action: { _, canDown in
        self.canScrollDown = canDown
      }
      .overlay(alignment: .top) {
        Rectangle()
          .fill(.black.opacity(0.15))
          .frame(height: 1)
          .opacity(self.canScrollUp ? 1 : 0)
          .animation(.easeInOut(duration: 0.2), value: self.canScrollUp)
      }
      .overlay(alignment: .bottom) {
        Rectangle()
          .fill(.black.opacity(0.15))
          .frame(height: 1)
          .opacity(self.canScrollDown ? 1 : 0)
          .animation(.easeInOut(duration: 0.2), value: self.canScrollDown)
      }
    }
    .padding(.horizontal, 48)
  }

  // MARK: - Navigation

  private var buttonLabel: String {
    switch self.step {
    case 0: return "Get Started"
    case 1: return "Next"
    default: return "Done"
    }
  }

  private var navigationArea: some View {
    VStack(spacing: 16) {
      
      HStack {
        Button {
          if self.step < self.totalSteps - 1 {
            withAnimation(.easeInOut(duration: 0.3)) {
              self.step += 1
            }
          } else {
            self.finishOnboarding()
          }
        } label: {
          Text(self.buttonLabel)
//            .fontWeight(.semibold)
//            .foregroundStyle(Color.hotlineRed)
            .padding(.vertical, 8)
            .padding(.horizontal, 28)
//            .background {
//              Capsule()
//                .fill(.white)
//            }
        }
//        .buttonStyle(.plain)
        .controlSize(.large)
        .buttonBorderShape(.capsule)
        .glassProminentButtonStyle()
        .tint(Color.white.opacity(0.7))
      }

      self.dotIndicators
    }
  }

  private var dotIndicators: some View {
    HStack(spacing: 8) {
      ForEach(0..<self.totalSteps, id: \.self) { index in
        Circle()
          .fill(.white.opacity(index == self.step ? 1.0 : 0.35))
          .frame(width: 7, height: 7)
      }
    }
  }

  // MARK: - Actions

  private func finishOnboarding() {
    let trimmed = self.username.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      self.showUsernameAlert = true
      return
    }

    Prefs.shared.username = trimmed
    Prefs.shared.userIconID = self.selectedIconID
    Prefs.shared.hasCompletedOnboarding = true
    Prefs.shared.showBannerToolbar = true

    self.openWindow(id: "servers")
    self.dismissWindow(id: "onboarding")
  }
}

#Preview {
  OnboardingView()
}
