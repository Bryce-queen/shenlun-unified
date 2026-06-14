const fs = require('fs');
const path = require('path');

const root = __dirname;
const requiredFiles = [
  'index.html',
  'styles.css',
  'data.js',
  'app.js',
  'manifest.json',
  'sw.js',
  'smoke-test.js',
  '404.html',
  '申论统一修炼台.html'
];

const missing = requiredFiles.filter(file=>!fs.existsSync(path.join(root, file)));
if(missing.length){
  console.error(`缺少文件：${missing.join(', ')}`);
  process.exit(1);
}

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
['./styles.css','./data.js','./app.js','./manifest.json'].forEach(ref=>{
  if(!html.includes(ref)){
    console.error(`index.html 缺少引用：${ref}`);
    process.exit(1);
  }
});

const forbiddenFiles = fs.readdirSync(root).filter(file=>/备份|backup|\.json$/i.test(file) && file !== 'manifest.json');
if(forbiddenFiles.length){
  console.error(`疑似不应发布的备份或数据文件：${forbiddenFiles.join(', ')}`);
  process.exit(1);
}

const source = ['app.js','data.js','index.html'].map(file=>fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
const secretPattern = /(sk-[A-Za-z0-9_-]{20,}|api[_-]?key\s*[:=]|secret\s*[:=]|bearer\s+[A-Za-z0-9._-]+)/i;
if(secretPattern.test(source)){
  console.error('发现疑似密钥或 Token，请检查后再发布。');
  process.exit(1);
}

console.log('发布检查通过。');
