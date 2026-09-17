// ===== 데이터 & 상태 =====
const STORAGE_KEY = 'fridge_ingredients_v1';
let ingredients = loadIngredients();
const AVG_PRICE_PER_ITEM = 3000; // 절약 추정 계산용 임의 단가(원)

// 간단 레시피 규칙 DB: 필요한 재료(키워드) -> 요리
const RECIPE_DB = [
  { name: '계란볶음밥', need: ['계란', '밥', '파'], desc: '계란과 남은 밥, 파만 있으면 완성!' },
  { name: '김치찌개', need: ['김치', '돼지고기', '두부'], desc: '신 김치와 돼지고기로 뚝딱.' },
  { name: '된장찌개', need: ['두부', '애호박', '된장'], desc: '기본 재료로 만드는 든든한 한 끼.' },
  { name: '계란말이', need: ['계란', '당근', '파'], desc: '자취생 필수 반찬.' },
  { name: '라면+계란', need: ['라면', '계란'], desc: '기본 중의 기본 조합.' },
  { name: '두부조림', need: ['두부', '간장', '파'], desc: '간단하고 저렴한 밑반찬.' },
  { name: '야채볶음', need: ['양파', '당근', '애호박'], desc: '냉장고 파먹기 대표 메뉴.' },
  { name: '토스트', need: ['식빵', '계란', '치즈'], desc: '아침용 초간단 메뉴.' },
];

// ===== DOM 참조 =====
const form = document.getElementById('ingredientForm');
const listEl = document.getElementById('ingredientList');
const emptyMsg = document.getElementById('emptyMessage');
const alertBanner = document.getElementById('alertBanner');
const sortSelect = document.getElementById('sortSelect');
const recipeList = document.getElementById('recipeList');
const recipeEmptyMsg = document.getElementById('recipeEmptyMessage');

// 통계 요소
const totalCountEl = document.getElementById('totalCount');
const soonCountEl = document.getElementById('soonCount');
const expiredCountEl = document.getElementById('expiredCount');
const savedCountEl = document.getElementById('savedCount');
const categoryStatsList = document.getElementById('categoryStatsList');

// 탭(메뉴) 관련
const navLinks = document.querySelectorAll('.nav-link');
const tabSections = document.querySelectorAll('.tab-section');
const menuToggle = document.getElementById('menuToggle');
const mainNav = document.querySelector('.main-nav');

// ===== 초기화 =====
document.addEventListener('DOMContentLoaded', () => {
  renderAll();
});

// ===== 탭 전환 =====
navLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const target = link.dataset.tab;

    navLinks.forEach(l => l.classList.remove('active'));
    link.classList.add('active');

    tabSections.forEach(sec => {
      sec.classList.toggle('active', sec.id === target);
    });

    mainNav.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
  });
});

menuToggle.addEventListener('click', () => {
  const isOpen = mainNav.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
});

// ===== 폼 제출 =====
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = document.getElementById('foodName').value.trim();
  const expiry = document.getElementById('expiryDate').value;
  const category = document.getElementById('foodCategory').value;

  if (!name || !expiry) return;

  ingredients.push({
    id: Date.now(),
    name,
    expiry,
    category,
  });

  saveIngredients();
  form.reset();
  renderAll();
});

// ===== 정렬 변경 =====
sortSelect.addEventListener('change', renderIngredientList);

// ===== 렌더링 총괄 =====
function renderAll() {
  renderIngredientList();
  renderAlertBanner();
  renderRecipes();
  renderStats();
}

// ===== 재료 목록 렌더링 =====
function renderIngredientList() {
  const sorted = [...ingredients].sort((a, b) => {
    if (sortSelect.value === 'name') {
      return a.name.localeCompare(b.name);
    }
    return new Date(a.expiry) - new Date(b.expiry);
  });

  listEl.innerHTML = '';

  if (sorted.length === 0) {
    emptyMsg.hidden = false;
    return;
  }
  emptyMsg.hidden = true;

  sorted.forEach(item => {
    const days = daysUntil(item.expiry);
    const li = document.createElement('li');
    li.className = 'ingredient-item';

    let badgeClass = 'badge-fresh';
    let badgeText = `D-${days}`;
    if (days < 0) {
      li.classList.add('expired');
      badgeClass = 'badge-expired';
      badgeText = '유통기한 지남';
    } else if (days <= 3) {
      li.classList.add('soon');
      badgeClass = 'badge-soon';
      badgeText = days === 0 ? '오늘까지!' : `D-${days} (임박)`;
    }

    li.innerHTML = `
      <span class="item-name">${escapeHTML(item.name)}</span>
      <span class="item-meta">분류: ${item.category} · 유통기한: ${item.expiry}</span>
      <span class="item-badge ${badgeClass}">${badgeText}</span>
      <button class="btn btn-danger" data-id="${item.id}">삭제</button>
    `;
    listEl.appendChild(li);
  });

  listEl.querySelectorAll('.btn-danger').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      ingredients = ingredients.filter(i => i.id !== id);
      saveIngredients();
      renderAll();
    });
  });
}

// ===== 알림 배너 (유통기한 3일 이내) =====
function renderAlertBanner() {
  const soonItems = ingredients.filter(i => {
    const d = daysUntil(i.expiry);
    return d >= 0 && d <= 3;
  });

  if (soonItems.length === 0) {
    alertBanner.hidden = true;
    return;
  }

  alertBanner.hidden = false;
  const names = soonItems.map(i => `${i.name}(D-${daysUntil(i.expiry)})`).join(', ');
  alertBanner.textContent = `⚠️ 유통기한이 임박한 재료가 있어요: ${names}`;
}

// ===== 요리 추천 =====
function renderRecipes() {
  const myItems = ingredients.map(i => i.name);
  recipeList.innerHTML = '';

  const matched = RECIPE_DB
    .map(recipe => {
      const have = recipe.need.filter(n => myItems.includes(n));
      return { ...recipe, have, matchRate: have.length / recipe.need.length };
    })
    .filter(r => r.have.length > 0)
    .sort((a, b) => b.matchRate - a.matchRate);

  if (matched.length === 0) {
    recipeEmptyMsg.hidden = false;
    return;
  }
  recipeEmptyMsg.hidden = true;

  matched.forEach(r => {
    const card = document.createElement('div');
    card.className = 'recipe-card';
    const tags = r.have.map(n => `<span class="used-tag">${escapeHTML(n)}</span>`).join('');
    card.innerHTML = `
      <h3>${escapeHTML(r.name)} (${Math.round(r.matchRate * 100)}% 일치)</h3>
      <p>${escapeHTML(r.desc)}</p>
      <div>${tags}</div>
    `;
    recipeList.appendChild(card);
  });
}

// ===== 통계 =====
function renderStats() {
  const total = ingredients.length;
  const soon = ingredients.filter(i => { const d = daysUntil(i.expiry); return d >= 0 && d <= 3; }).length;
  const expired = ingredients.filter(i => daysUntil(i.expiry) < 0).length;
  const usedInRecipe = ingredients.length - expired; // 폐기 안 된 재료 = 절약 추정

  totalCountEl.textContent = total;
  soonCountEl.textContent = soon;
  expiredCountEl.textContent = expired;
  savedCountEl.textContent = (usedInRecipe * AVG_PRICE_PER_ITEM).toLocaleString();

  const byCategory = {};
  ingredients.forEach(i => {
    byCategory[i.category] = (byCategory[i.category] || 0) + 1;
  });

  categoryStatsList.innerHTML = '';
  if (Object.keys(byCategory).length === 0) {
    categoryStatsList.innerHTML = '<li>등록된 재료가 없습니다.</li>';
  } else {
    Object.entries(byCategory).forEach(([cat, count]) => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${escapeHTML(cat)}</span><span>${count}개</span>`;
      categoryStatsList.appendChild(li);
    });
  }
}

// ===== 유틸 =====
function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  const diffMs = target - today;
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

function saveIngredients() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ingredients));
}

function loadIngredients() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function escapeHTML(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
