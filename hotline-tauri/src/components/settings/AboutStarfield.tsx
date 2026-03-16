import { useEffect, useRef } from 'react';

const VERTEX_SRC = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const FRAGMENT_SRC = `
  precision highp float;

  uniform vec2 u_resolution;
  uniform float u_time;

  float hash(vec2 p) {
    p = fract(p * vec2(443.897, 441.423));
    p += dot(p, p.yx + 19.19);
    return fract((p.x + p.y) * p.x);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    for (int i = 0; i < 4; i++) {
      value += amplitude * noise(p * frequency);
      frequency *= 2.0;
      amplitude *= 0.5;
    }
    return value;
  }

  float comet(vec2 uv, float aspect, float time) {
    float interval = 35.0;
    float flightDuration = 1.8;
    float cometIndex = floor(time / interval);
    float localTime = mod(time, interval);
    if (localTime > flightDuration) return 0.0;
    float progress = localTime / flightDuration;
    float seed = cometIndex * 7.31;
    float startX = -0.1 + hash(vec2(seed, 0.1)) * 0.3;
    float startY = 0.8 + hash(vec2(seed, 0.2)) * 0.2;
    float endX = 0.7 + hash(vec2(seed, 0.3)) * 0.4;
    float endY = 0.2 + hash(vec2(seed, 0.4)) * 0.3;
    vec2 headPos = vec2(mix(startX, endX, progress) * aspect, mix(startY, endY, progress));
    vec2 dir = normalize(vec2((endX - startX) * aspect, endY - startY));
    vec2 toHead = uv - headPos;
    float ahead = dot(toHead, dir);
    float perp = abs(dot(toHead, vec2(-dir.y, dir.x)));
    float headDist = length(toHead);
    float head = smoothstep(0.012, 0.0, headDist) * 1.2;
    head += smoothstep(0.03, 0.0, headDist) * 0.3;
    float tailLen = 0.35 + 0.15 * hash(vec2(seed, 0.5));
    float tailFade = smoothstep(-tailLen, 0.0, ahead);
    float tailWidth = 0.003 + 0.012 * (1.0 - tailFade);
    float tail = smoothstep(tailWidth, tailWidth * 0.3, perp) * tailFade;
    tail *= (ahead < 0.01) ? 1.0 : 0.0;
    float flicker = 0.7 + 0.3 * sin(ahead * 80.0 + time * 15.0);
    tail *= flicker;
    float dust = 0.0;
    for (int i = 0; i < 12; i++) {
      float fi = float(i);
      float dustSeed = seed + fi * 3.17;
      float spawnT = hash(vec2(dustSeed, 0.6)) * 0.8;
      float spawnTime = spawnT * flightDuration;
      float dustAge = localTime - spawnTime;
      if (dustAge < 0.0 || dustAge > 1.5) continue;
      vec2 spawnPos = vec2(mix(startX, endX, spawnT) * aspect, mix(startY, endY, spawnT));
      vec2 drift = vec2((hash(vec2(dustSeed, 0.7)) - 0.5) * 0.08, (hash(vec2(dustSeed, 0.8)) - 0.5) * 0.06);
      vec2 dustPos = spawnPos + drift * dustAge;
      float dustDist = length(uv - dustPos);
      float dustBright = smoothstep(0.0025, 0.0, dustDist) * (1.0 - dustAge / 1.5);
      dust += dustBright * 0.4;
    }
    float envelope = smoothstep(0.0, 0.1, progress) * smoothstep(1.0, 0.7, progress);
    float edgeFadeX = smoothstep(0.0, 0.08, uv.x / aspect) * smoothstep(1.0, 0.92, uv.x / aspect);
    float edgeFadeY = smoothstep(0.0, 0.08, uv.y) * smoothstep(1.0, 0.92, uv.y);
    envelope *= edgeFadeX * edgeFadeY;
    return (head + tail * 0.6 + dust) * envelope;
  }

  float stars(vec2 uv, float scale, float threshold, float sizeMin, float sizeMax) {
    vec2 scaledUV = uv * scale;
    vec2 grid = floor(scaledUV);
    vec2 f = fract(scaledUV);
    float star = 0.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 neighbor = vec2(float(x), float(y));
        vec2 cell = grid + neighbor;
        float r = hash(cell);
        if (r > threshold) {
          vec2 starPos = vec2(hash(cell + 0.1), hash(cell + 0.2));
          vec2 diff = neighbor + starPos - f;
          float dist = length(diff);
          float brightness = (r - threshold) / (1.0 - threshold);
          float twinkleSpeed = 0.3 + hash(cell + 0.3) * 0.8;
          float twinklePhase = hash(cell + 0.4) * 6.2831;
          float twinkle = 0.65 + 0.35 * sin(u_time * twinkleSpeed + twinklePhase);
          float sizeFactor = hash(cell + 0.5);
          float size = sizeMin + (sizeMax - sizeMin) * (brightness * 0.4 + sizeFactor * 0.6);
          float core = smoothstep(size, 0.0, dist);
          float glow = smoothstep(size * 3.5, 0.0, dist) * 0.12;
          star += brightness * twinkle * (core + glow);
        }
      }
    }
    return star;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    float aspect = u_resolution.x / u_resolution.y;
    vec2 uvAspect = vec2(uv.x * aspect, uv.y);

    float t = u_time * 0.06;

    vec3 bgDark = vec3(0.02, 0.01, 0.06);
    vec3 bgMid = vec3(0.05, 0.02, 0.12);
    vec3 bg = mix(bgDark, bgMid, uv.y * 0.5 + 0.25);

    float diagonal = uv.x * 0.6 + uv.y * 0.4;

    float nebulaNoise1 = fbm(uvAspect * 3.0 + vec2(t * 0.5, t * 0.3));
    float nebulaNoise2 = fbm(uvAspect * 5.0 - vec2(t * 0.4, t * 0.6));
    float nebulaWarp = (nebulaNoise1 - 0.5) * 0.15 + (nebulaNoise2 - 0.5) * 0.08;

    float bandDist = abs(diagonal - 0.5 + nebulaWarp);
    float bandMask = smoothstep(0.35, 0.05, bandDist);

    float nebulaDetail = 0.5;
    if (bandMask > 0.01) {
      float detail1 = fbm(uvAspect * 8.0 + vec2(t, -t * 0.7));
      float detail2 = fbm(uvAspect * 12.0 - vec2(t * 0.8, t * 0.5));
      nebulaDetail = detail1 * 0.6 + detail2 * 0.4;
    }

    vec3 cyan = vec3(0.3, 0.8, 0.95);
    vec3 blue = vec3(0.15, 0.3, 0.8);
    vec3 purple = vec3(0.4, 0.15, 0.6);
    vec3 magenta = vec3(0.8, 0.2, 0.6);
    vec3 pink = vec3(0.9, 0.4, 0.7);

    vec3 nebulaColor;
    float colorPos = diagonal + nebulaDetail * 0.1;
    if (colorPos < 0.3) {
      nebulaColor = mix(cyan, blue, smoothstep(0.1, 0.3, colorPos));
    } else if (colorPos < 0.5) {
      nebulaColor = mix(blue, purple, smoothstep(0.3, 0.5, colorPos));
    } else if (colorPos < 0.7) {
      nebulaColor = mix(purple, magenta, smoothstep(0.5, 0.7, colorPos));
    } else {
      nebulaColor = mix(magenta, pink, smoothstep(0.7, 0.9, colorPos));
    }

    float nebulaIntensity = bandMask * (0.5 + 0.5 * nebulaDetail);

    float glowMask = smoothstep(0.5, 0.1, bandDist) * 0.3;
    vec3 glowColor = mix(vec3(0.1, 0.15, 0.4), vec3(0.3, 0.1, 0.3), diagonal);

    vec3 color = bg;
    color += glowColor * glowMask;
    color += nebulaColor * nebulaIntensity * 0.8;

    float coreDist = abs(diagonal - 0.5 + nebulaWarp);
    float coreMask = smoothstep(0.12, 0.0, coreDist) * nebulaDetail;
    color += nebulaColor * coreMask * 0.5;

    vec2 m1 = vec2(u_time * 0.006, u_time * 0.0025);
    float s1 = stars(uvAspect + m1, 20.0, 0.98, 0.10, 0.18);

    vec2 m2 = vec2(u_time * 0.0045, u_time * 0.0018);
    float s2 = stars(uvAspect + 50.0 + m2, 30.0, 0.97, 0.06, 0.12);

    vec2 m3 = vec2(u_time * 0.003, u_time * 0.0012);
    float s3 = stars(uvAspect + 100.0 + m3, 50.0, 0.95, 0.04, 0.08);

    float starDim = 1.0 - nebulaIntensity * 0.4;

    vec3 warmStar = vec3(1.0, 0.92, 0.8);
    vec3 neutralStar = vec3(1.0);

    color += warmStar * s1 * 1.0 * starDim;
    color += warmStar * s2 * 0.95 * starDim;
    color += neutralStar * s3 * 0.9 * starDim;

    // Comet
    float cometBright = comet(vec2(uv.x * aspect, uv.y), aspect, u_time);
    color += vec3(0.85, 0.9, 1.0) * cometBright;

    color = pow(color, vec3(0.95));
    color = clamp(color, 0.0, 1.0);

    gl_FragColor = vec4(color, 1.0);
  }
`;

function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${info}`);
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext, vertSrc: string, fragSrc: string) {
  const vert = createShader(gl, gl.VERTEX_SHADER, vertSrc);
  const frag = createShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  const program = gl.createProgram()!;
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    throw new Error(`Program link error: ${info}`);
  }
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  return program;
}

export default function AboutStarfield() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return;

    const program = createProgram(gl, VERTEX_SRC, FRAGMENT_SRC);

    const posBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const aPosition = gl.getAttribLocation(program, 'a_position');
    const uResolution = gl.getUniformLocation(program, 'u_resolution');
    const uTime = gl.getUniformLocation(program, 'u_time');

    gl.useProgram(program);

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = rect.width * dpr;
      const h = rect.height * dpr;
      canvas!.width = w;
      canvas!.height = h;
      gl!.viewport(0, 0, w, h);
      gl!.uniform2f(uResolution, w, h);
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();

    const startTime = performance.now();
    let rafId: number;

    function render() {
      const elapsed = (performance.now() - startTime) / 1000;
      gl!.useProgram(program);
      gl!.bindBuffer(gl!.ARRAY_BUFFER, posBuffer);
      gl!.enableVertexAttribArray(aPosition);
      gl!.vertexAttribPointer(aPosition, 2, gl!.FLOAT, false, 0, 0);
      gl!.uniform1f(uTime, elapsed);
      gl!.drawArrays(gl!.TRIANGLES, 0, 6);
      rafId = requestAnimationFrame(render);
    }
    render();

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      gl!.deleteBuffer(posBuffer);
      gl!.deleteProgram(program);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  );
}
