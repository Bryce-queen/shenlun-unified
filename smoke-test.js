const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = __dirname;
const read = file=>fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const app = read('app.js');
const data = read('data.js');

const requiredIds = [
  'app', 'view-home', 'view-review', 'view-practice', 'view-errors', 'view-stats',
  'backup-reminder', 'update-banner', 'settings-card', 'backup-file', 'tab-bar'
];
for(const id of requiredIds){
  if(!html.includes(`id="${id}"`)) throw new Error(`缺少 DOM 节点：#${id}`);
}

const requiredFunctions = [
  'renderHome', 'renderSettings', 'exportBackup', 'importBackup', 'runDataHealthCheck',
  'exportErrorsMarkdown', 'setupUpdateChecks', 'reloadForUpdate', 'sanitizeState'
];
for(const name of requiredFunctions){
  if(!app.includes(`function ${name}`)) throw new Error(`缺少函数：${name}`);
}

vm.runInNewContext(data, {}, {filename:'data.js'});
function createElement(){
  return {
    style:{},
    dataset:{},
    className:'',
    innerHTML:'',
    textContent:'',
    value:'',
    checked:false,
    appendChild(){},
    click(){},
    remove(){},
    querySelector(){ return null; },
    querySelectorAll(){ return []; },
    classList:{add(){}, remove(){}, toggle(){}, contains(){ return false; }}
  };
}

const elements = new Map(requiredIds.map(id=>[id, createElement()]));
[
  'home-week-card','home-stats','home-tasks','home-start-btn','review-due-count',
  'deck-grid','error-filters','error-weekend-btn','error-list','error-empty',
  'vocab-trainer-stats','material-trainer-stats','mock-exam-stats','radar-chart',
  'stats-grid','review-summary','weekly-chart','handbook-tabs','handbook-list'
].forEach(id=>elements.set(id, createElement()));

vm.runInNewContext(app, {
  window:{addEventListener(){}},
  document:{
    querySelector(selector){
      if(selector === '.tab[data-view="errors"]') return createElement();
      if(selector === '.tab[data-view="errors"] .badge') return createElement();
      return null;
    },
    querySelectorAll(){ return []; },
    getElementById(id){ return elements.get(id) || createElement(); },
    createElement,
    body:{appendChild(){}, classList:{toggle(){}}}
  },
  localStorage:{getItem(){ return '{}'; }, setItem(){}, removeItem(){}},
  navigator:{},
  location:{protocol:'file:', reload(){}},
  alert(){},
  confirm(){ return false; },
  Blob:function(){},
  URL:{createObjectURL(){ return ''; }, revokeObjectURL(){}},
  setInterval(){ return 0; },
  clearInterval(){},
  setTimeout(){ return 0; },
  clearTimeout(){},
  Date,
  Math,
  Object,
  Array,
  String,
  Number,
  RegExp,
  JSON,
  console,
  CARD_DB:{},
  SKILL_DATA:[],
  WEEK_PLAN:Array.from({length:12}, (_,i)=>({week:i+1, phase:'基础期', title:'测试', skills:[], decks:[]})),
  HANDBOOK_SECTIONS:[],
  VOCAB_TRAINING_DATA:[],
  MATERIAL_TRAINING_DATA:[]
}, {filename:'app.js'});

console.log('Smoke test passed.');
