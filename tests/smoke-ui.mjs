// Smoke test giao diện: kiểm tra static serving và đối chiếu
// mọi đường dẫn API mà frontend gọi với route thật đã đăng ký.
import fs from 'node:fs';
import http from 'node:http';
import App from '../src/app.js';

const app = new App();
app.initializeMiddleware();
app.initializeRoutes();

// ---- thu thập route đã đăng ký ----
const registered = [];
app.app._router.stack.forEach((layer) => {
  if (layer.name === 'router' && layer.handle.stack) {
    layer.handle.stack.forEach((r) => {
      if (r.route) {
        Object.keys(r.route.methods).forEach((m) =>
          registered.push({ method: m.toUpperCase(), path: '/api' + r.route.path })
        );
      }
    });
  }
});

// ---- thu thập đường dẫn frontend gọi ----
const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const js = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

const fePaths = new Set();
for (const m of html.matchAll(/data-(?:path|src)="(\/api[^"]*)"/g)) fePaths.add(m[1]);
for (const m of js.matchAll(/["'`](\/api\/[a-zA-Z0-9/_-]*)/g)) fePaths.add(m[1]);

// Đường dẫn FE ghép thêm tham số động (`${path}/${value}`) -> kiểm tra cả biến thể có :param
// Frontend ghép tham số động vào đường dẫn (`${path}/${value}`) nên chuỗi
// trích ra là phần tiền tố. Ánh xạ sang route thật có :param để đối chiếu.
const dynamicSuffixes = {
  '/api/sync/students': '/api/sync/students/:maSinhVien',
  '/api/sync/teachers': '/api/sync/teachers/:maGiangVien',
  '/api/sync/courses': '/api/sync/courses/:maLopHocPhan',
  '/api/enrollments/students': '/api/enrollments/students/:maSinhVien',
  '/api/enrollments/teachers': '/api/enrollments/teachers/:maGiangVien',
  '/api/moodle/courses/': '/api/moodle/courses/:courseId/users',
  '/api/data/': '/api/data/:dataset',
};

const matches = (fePath) =>
  registered.some((r) => r.path === fePath) ||
  registered.some((r) => {
    const re = new RegExp('^' + r.path.replace(/:[^/]+/g, '[^/]+') + '$');
    return re.test(fePath);
  });

console.log('=== ĐỐI CHIẾU ĐƯỜNG DẪN FRONTEND ↔ ROUTE ===');
let bad = 0;
for (const p of [...fePaths].sort()) {
  const target = dynamicSuffixes[p] || p;
  const okBase = matches(p) || matches(target);
  if (!okBase) {
    bad++;
    console.log(`  MISSING  ${p}`);
  } else {
    console.log(`  ok       ${p}`);
  }
}
console.log(bad === 0 ? 'PASS  mọi đường dẫn FE đều có route' : `FAIL  ${bad} đường dẫn không có route`);

// ---- kiểm tra static serving ----
const server = app.app.listen(0);
const port = server.address().port;

const get = (path) =>
  new Promise((resolve) => {
    http.get({ port, path }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], len: data.length }));
    }).on('error', (e) => resolve({ status: 'ERR', type: e.message, len: 0 }));
  });

console.log('\n=== STATIC ===');
let staticBad = 0;
for (const [path, expectType] of [
  ['/', 'text/html'],
  ['/styles.css', 'text/css'],
  ['/app.js', 'javascript'],
  ['/api', 'application/json'],
]) {
  const r = await get(path);
  const good = r.status === 200 && String(r.type).includes(expectType) && r.len > 0;
  if (!good) staticBad++;
  console.log(`  ${good ? 'ok      ' : 'FAIL    '} ${path} -> ${r.status} ${r.type} ${r.len}B`);
}
console.log(staticBad === 0 ? 'PASS  static serving' : `FAIL  ${staticBad} tài nguyên lỗi`);

server.close();
process.exit(bad + staticBad === 0 ? 0 : 1);
