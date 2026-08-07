// Smoke test: dựng app không kết nối DB, liệt kê route và gọi thử vài endpoint
import App from '../src/app.js';

const app = new App();
app.initializeMiddleware();
app.initializeRoutes();

const routes = [];
app.app._router.stack.forEach((layer) => {
  if (layer.route) {
    routes.push(`${Object.keys(layer.route.methods).join(',').toUpperCase()} ${layer.route.path}`);
  } else if (layer.name === 'router' && layer.handle.stack) {
    layer.handle.stack.forEach((r) => {
      if (r.route) {
        routes.push(
          `${Object.keys(r.route.methods).join(',').toUpperCase()} /api${r.route.path}`
        );
      }
    });
  }
});

console.log('=== ROUTES (' + routes.length + ') ===');
routes.forEach((r) => console.log('  ' + r));

// Gọi thử: 404, thiếu tenDot, thiếu idDot
const http = await import('node:http');
const server = app.app.listen(0);
const port = server.address().port;

const call = (method, path, body) =>
  new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      { method, port, path, headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {} },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, body: data.slice(0, 220) }));
      }
    );
    req.on('error', (e) => resolve({ status: 'ERR', body: e.message }));
    if (payload) req.write(payload);
    req.end();
  });

console.log('\n=== SMOKE CALLS ===');
for (const [m, p, b] of [
  ['GET', '/', null],
  ['GET', '/api/khong-ton-tai', null],
  ['POST', '/api/sync/students', {}],
  ['POST', '/api/sync/courses/ABC123', {}],
  ['GET', '/api/reports/locked-grades', null],
  ['DELETE', '/api/moodle/quizzes', {}],
  ['POST', '/api/scheduler/jobs/khongCoJob/run', null],
  ['GET', '/api/scheduler/status', null],
]) {
  const r = await call(m, p, b);
  console.log(`${m} ${p} -> ${r.status}`);
  console.log(`   ${r.body}`);
}

server.close();
process.exit(0);
