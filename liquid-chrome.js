import { Renderer, Program, Mesh, Triangle } from 'https://unpkg.com/ogl@0.0.90';

function hexToRgb(hex) {
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  hex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);

  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [
    parseInt(result[1], 16) / 255,
    parseInt(result[2], 16) / 255,
    parseInt(result[3], 16) / 255
  ] : [0.1, 0.1, 0.1];
}

const container = document.getElementById('liquid-chrome-container');

if (container) {
  const speed = 0.2;
  const amplitude = 0.3;
  const frequencyX = 3;
  const frequencyY = 3;
  const interactive = true;

  const renderer = new Renderer({ antialias: true });
  const gl = renderer.gl;
  gl.clearColor(1, 1, 1, 1);

  const vertexShader = `
    attribute vec2 position;
    attribute vec2 uv;
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position, 0.0, 1.0);
    }
  `;

  const fragmentShader = `
    precision highp float;
    uniform float uTime;
    uniform vec3 uResolution;
    uniform vec3 uBaseColor;
    uniform float uAmplitude;
    uniform float uFrequencyX;
    uniform float uFrequencyY;
    uniform vec2 uMouse;
    varying vec2 vUv;

    vec4 renderImage(vec2 uvCoord) {
        vec2 fragCoord = uvCoord * uResolution.xy;
        vec2 uv = (2.0 * fragCoord - uResolution.xy) / min(uResolution.x, uResolution.y);

        for (float i = 1.0; i < 10.0; i++){
            uv.x += uAmplitude / i * cos(i * uFrequencyX * uv.y + uTime + uMouse.x * 3.14159);
            uv.y += uAmplitude / i * cos(i * uFrequencyY * uv.x + uTime + uMouse.y * 3.14159);
        }

        vec2 diff = (uvCoord - uMouse);
        float dist = length(diff);
        float falloff = exp(-dist * 20.0);
        float ripple = sin(10.0 * dist - uTime * 2.0) * 0.03;
        uv += (diff / (dist + 0.0001)) * ripple * falloff;

        vec3 color = uBaseColor / abs(sin(uTime - uv.y - uv.x));
        return vec4(color, 1.0);
    }

    void main() {
        vec4 col = vec4(0.0);
        int samples = 0;
        for (int i = -1; i <= 1; i++){
            for (int j = -1; j <= 1; j++){
                vec2 offset = vec2(float(i), float(j)) * (1.0 / min(uResolution.x, uResolution.y));
                col += renderImage(vUv + offset);
                samples++;
            }
        }
        gl_FragColor = col / float(samples);
    }
  `;

  const geometry = new Triangle(gl);
  const program = new Program(gl, {
    vertex: vertexShader,
    fragment: fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uResolution: {
        value: new Float32Array([gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height])
      },
      uBaseColor: { value: new Float32Array([0.1, 0.1, 0.1]) },
      uAmplitude: { value: amplitude },
      uFrequencyX: { value: frequencyX },
      uFrequencyY: { value: frequencyY },
      uMouse: { value: new Float32Array([0, 0]) }
    }
  });
  const mesh = new Mesh(gl, { geometry, program });

  function resize() {
    const scale = 1;
    renderer.setSize(container.offsetWidth * scale, container.offsetHeight * scale);
    const resUniform = program.uniforms.uResolution.value;
    resUniform[0] = gl.canvas.width;
    resUniform[1] = gl.canvas.height;
    resUniform[2] = gl.canvas.width / gl.canvas.height;
  }
  window.addEventListener('resize', resize);
  resize();

  const sidebar = document.querySelector('.sidebar');

  function handleMouseMove(event) {
    const rect = sidebar.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = 1 - (event.clientY - rect.top) / rect.height;
    const mouseUniform = program.uniforms.uMouse.value;
    mouseUniform[0] = x;
    mouseUniform[1] = y;
  }

  function handleTouchMove(event) {
    if (event.touches.length > 0) {
      const touch = event.touches[0];
      const rect = sidebar.getBoundingClientRect();
      const x = (touch.clientX - rect.left) / rect.width;
      const y = 1 - (touch.clientY - rect.top) / rect.height;
      const mouseUniform = program.uniforms.uMouse.value;
      mouseUniform[0] = x;
      mouseUniform[1] = y;
    }
  }

  if (interactive && sidebar) {
    sidebar.addEventListener('mousemove', handleMouseMove);
    sidebar.addEventListener('touchmove', handleTouchMove);
  }

  let animationId;
  function update(t) {
    animationId = requestAnimationFrame(update);
    program.uniforms.uTime.value = t * 0.001 * speed;
    renderer.render({ scene: mesh });
  }
  animationId = requestAnimationFrame(update);

  container.appendChild(gl.canvas);
}
