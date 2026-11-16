// HTML 오버레이: 설명 패널, 슬라이더·토글·카드 같은 조작부, 이동 버튼.
import { SCENES, SITE } from '../scenes.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

export class UI {
  constructor(app) {
    this.app = app;
    this.panel = $('panel');
    this.inner = $('panel-inner');
    this.controls = $('controls');
    this.hudEl = $('hud');
    this.intro = $('intro');
    this.ending = $('ending');

    $('brand-sub').textContent = SITE.project;
    document.querySelector('#mode [data-mode=tour]').textContent = SITE.tour;
    document.querySelector('#mode [data-mode=free]').textContent = SITE.free;
    document.querySelector('#mode [data-mode=walk]').textContent = SITE.walk;
    $('prev').textContent = SITE.prev;
    $('next').textContent = SITE.next;
    $('free-hint').textContent = SITE.freeHint;
    $('enter').textContent = SITE.enter;
    this.intro.querySelector('.intro-project').textContent = SITE.project;
    this.intro.querySelector('.intro-sub').textContent = SITE.subtitle;
    this.intro.querySelector('.intro-hint').textContent = SITE.hint;

    const end = SCENES[SCENES.length - 1];
    this.ending.querySelector('.ending-rule').textContent = end.t.end.rule;
    this.ending.querySelector('.ending-quote').innerHTML = end.quote;
    this.ending.querySelector('.ending-practice').innerHTML =
      `<b>${end.t.end.practiceTitle}</b>` + end.t.end.practice.map((p) => `<span>${p}</span>`).join('');
    $('back').textContent = end.t.end.back;
    $('restart').textContent = end.t.end.restart;
    $('explore').textContent = end.t.end.explore;
    $('back').addEventListener('click', () => this.onPartBack?.());

    // 위쪽 진행 표시: 장면마다 한 칸
    const prog = $('progress');
    this.ticks = SCENES.map((sc, i) => {
      const li = el('li');
      const b = el('button');
      b.type = 'button';
      b.dataset.tip = `${i + 1}. ${sc.title}`;
      b.setAttribute('aria-label', `${i + 1}번 장면: ${sc.title}`);
      b.addEventListener('click', () => this.onGo?.(i));
      li.appendChild(b);
      prog.appendChild(li);
      return b;
    });

    $('prev').addEventListener('click', () => this.onPrev?.());
    $('next').addEventListener('click', () => this.onNext?.());
    $('enter').addEventListener('click', () => this.onNext?.());
    $('brand').addEventListener('click', () => this.onGo?.(0));
    $('restart').addEventListener('click', () => this.onGo?.(0));
    $('explore').addEventListener('click', () => this.onMode?.('free'));
    for (const b of document.querySelectorAll('#mode button')) b.addEventListener('click', () => this.onMode?.(b.dataset.mode));
  }

  setMode(mode) {
    document.body.dataset.mode = mode;
    for (const b of document.querySelectorAll('#mode button')) b.classList.toggle('on', b.dataset.mode === mode);
    this.refreshPanel();
  }

  setScene(i, sc) {
    this.scene = sc;
    document.body.dataset.scene = sc.id;
    this.panel.className = this.panel.className.replace(/\btone-\w+/g, '').trim();
    this.panel.classList.add(`tone-${sc.tone || 'amber'}`);
    $('kicker').querySelector('span').textContent = sc.kicker || '';
    $('title').textContent = sc.title;
    $('body').innerHTML = (sc.body || []).map((p) => `<p>${p}</p>`).join('');
    const ex = $('example');
    ex.style.display = sc.example ? '' : 'none';
    ex.querySelector('span').textContent = SITE.example;
    ex.querySelector('p').textContent = sc.example || '';
    this.setArticle(sc.article);
    const mean = $('meaning');
    mean.style.display = sc.meaning ? '' : 'none';
    mean.querySelector('span').textContent = SITE.meaning;
    mean.querySelector('p').textContent = sc.meaning || '';
    const tryit = $('tryit');
    tryit.style.display = sc.tryIt ? '' : 'none';
    tryit.querySelector('span').textContent = SITE.tryIt;
    tryit.querySelector('em').textContent = sc.tryIt || '';
    this.controls.innerHTML = '';
    this.panel.scrollTop = 0;
    this.inner.classList.remove('swap');
    void this.inner.offsetWidth;
    this.inner.classList.add('swap');
    this.ticks.forEach((t, k) => {
      t.classList.toggle('on', k === i);
      t.classList.toggle('done', k < i);
    });
    $('counter').textContent = `${String(i + 1).padStart(2, '0')} / ${SCENES.length}`;
    $('prev').disabled = i === 0;
    $('next').disabled = i === SCENES.length - 1;
    this.hud(null);
    this.showIntro(false);
    this.showEnding(false);
    this.refreshPanel();
  }

  refreshPanel() {
    const mode = document.body.dataset.mode;
    const hide = !this.scene || this.scene.panel === false || this.partHidden || mode === 'free' || mode === 'walk';
    this.panel.classList.toggle('hidden', hide);
  }

  // 패널이 화면을 가리는 만큼(px). 카메라가 그만큼 장면을 비켜 잡는다.
  inset() {
    // 엔딩은 글이 위쪽에 놓이므로 도시를 아래로 내려 잡는다
    if (this.partHidden && document.body.dataset.mode === 'tour') return { x: 0, y: -window.innerHeight * (window.innerWidth <= 760 ? 0.2 : 0.1) };
    if (this.panel.classList.contains('hidden')) return { x: 0, y: 0 };
    if (window.innerWidth <= 760) return { x: 0, y: Math.min(this.panel.offsetHeight, window.innerHeight * 0.47) * 0.5 };
    return { x: (this.panel.offsetWidth + 28) * 0.5, y: 0 };
  }

  setPanelHidden(v) {
    this.partHidden = !!v;
    this.refreshPanel();
  }

  setArticle(art) {
    const a = $('article');
    a.style.display = art ? '' : 'none';
    if (!art) return;
    a.href = art.url;
    a.querySelector('.a-k').textContent = SITE.article;
    a.querySelector('b').textContent = art.title;
    a.querySelector('i').textContent = `${art.outlet} · ${art.date}`;
    a.querySelector('p').textContent = art.note;
    a.querySelector('em').textContent = `${SITE.articleOpen} ↗`;
  }

  clearControls() {
    this.controls.innerHTML = '';
  }

  // 조작이 둘인 장면의 부분 탭 + 그 부분의 안내 글
  partTabs(parts, active, onPick) {
    const wrap = el('div', 'tabs');
    const btns = parts.map((p, i) => {
      const b = el('button', `tab${i === active ? ' on' : ''}`, p.label);
      b.type = 'button';
      b.addEventListener('click', () => onPick(i));
      wrap.appendChild(b);
      return b;
    });
    this.add(wrap);
    if (parts[active]?.note) this.add(el('p', 'note part-note', parts[active].note));
    this.setArticle(parts[active]?.article ?? this.scene?.article);
    return { btns };
  }

  showIntro(v) {
    this.intro.classList.toggle('on', v);
  }
  showEnding(v) {
    this.ending.classList.toggle('on', v);
  }

  // 화면 위쪽 큰 숫자
  hud(html, tone) {
    if (html == null) {
      this.hudEl.classList.remove('on');
      return;
    }
    if (this.hudEl.innerHTML !== html) this.hudEl.innerHTML = html;
    this.hudEl.className = `on tone-${tone || 'amber'}`;
  }

  // ── 조작부 만들기 ────────────────────────────────
  add(node) {
    this.controls.appendChild(node);
    return node;
  }

  slider({ label, min, max, step = 1, value, format = (v) => v, onInput, ends }) {
    const f = el('div', 'field');
    const top = el('label');
    const name = el('span', '', label);
    const out = el('output');
    top.append(name, out);
    const input = el('input');
    input.type = 'range';
    Object.assign(input, { min, max, step, value });
    input.setAttribute('aria-label', label.replace(/<[^>]+>/g, ''));
    const paint = () => {
      input.style.setProperty('--fill', `${((input.value - min) / (max - min)) * 100}%`);
      out.innerHTML = format(Number(input.value));
    };
    input.addEventListener('input', () => {
      paint();
      onInput?.(Number(input.value));
    });
    f.append(top, input);
    if (ends) f.appendChild(el('div', 'ends', `<span>${ends[0]}</span><span>${ends[1]}</span>`));
    paint();
    this.add(f);
    return {
      el: f,
      get value() {
        return Number(input.value);
      },
      set(v, fire = false) {
        input.value = v;
        paint();
        if (fire) onInput?.(Number(input.value));
      },
    };
  }

  toggle({ label, value = false, tone = 'amber', onChange }) {
    const b = el('button', `toggle tone-${tone}`, `<span>${label}</span><i></i>`);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(value));
    b.addEventListener('click', () => {
      const v = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(v));
      onChange?.(v);
    });
    this.add(b);
    return { el: b, set: (v) => b.setAttribute('aria-pressed', String(v)) };
  }

  button(label, onClick, { primary = false, parent = null } = {}) {
    const b = el('button', `btn wide${primary ? ' primary' : ''}`, label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    (parent || this.controls).appendChild(b);
    return b;
  }

  row() {
    return this.add(el('div', 'row'));
  }

  stats(items, cols = items.length > 3 ? 2 : items.length) {
    const wrap = el('div', 'stats');
    wrap.style.setProperty('--cols', cols);
    const cells = items.map((it) => {
      const c = el('div', `stat${it.tone ? ' tone-' + it.tone : ''}`);
      c.append(el('div', 'k', it.label), el('div', 'v', it.value ?? '–'));
      wrap.appendChild(c);
      return c;
    });
    this.add(wrap);
    return {
      el: wrap,
      set(i, value, tone) {
        const v = cells[i].lastChild;
        if (v.innerHTML !== String(value)) v.innerHTML = value;
        if (tone !== undefined) cells[i].className = `stat${tone ? ' tone-' + tone : ''}`;
      },
    };
  }

  headline(html, tone = 'red') {
    const h = this.add(el('div', `headline tone-${tone}`, html));
    return { el: h, set: (t) => (h.innerHTML = t) };
  }

  chips(items, onPick) {
    const wrap = el('div', 'chips');
    const btns = items.map((it, i) => {
      const b = el('button', 'chip', it);
      b.type = 'button';
      b.addEventListener('click', () => onPick(i));
      wrap.appendChild(b);
      return b;
    });
    this.add(wrap);
    return { el: wrap, mark: (i) => btns.forEach((b, k) => b.classList.toggle('on', k === i)) };
  }

  segmented(items, value, onChange) {
    const wrap = el('div', 'seg');
    const btns = items.map((it) => {
      const b = el('button', `chip${it.key === value ? ' on' : ''}`, it.label);
      b.type = 'button';
      b.addEventListener('click', () => {
        btns.forEach((x) => x.classList.toggle('on', x === b));
        onChange(it.key);
      });
      wrap.appendChild(b);
      return b;
    });
    this.add(wrap);
    return wrap;
  }

  cards(items) {
    const wrap = el('div', 'cards');
    const nodes = items.map((it) => {
      const c = el(it.onClick ? 'button' : 'div', `card${it.tone ? ' tone-' + it.tone : ''}${it.cls ? ' ' + it.cls : ''}`);
      if (it.onClick) {
        c.type = 'button';
        c.addEventListener('click', it.onClick);
      }
      c.innerHTML = it.html ?? `<b>${it.title}</b><span>${it.text}</span>`;
      wrap.appendChild(c);
      return c;
    });
    this.add(wrap);
    return nodes;
  }

  note(text, strong = false, tone = 'amber') {
    return this.add(el('p', `note${strong ? ' strong tone-' + tone : ''}`, text));
  }

  // 그래프용 캔버스 (기기 픽셀 비율에 맞춘다)
  canvas(height = 120, caption = '') {
    const c = el('canvas', 'chart');
    this.add(c);
    if (caption) this.add(el('p', 'chart-cap', caption));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(200, this.controls.clientWidth || 330);
    c.style.height = `${height}px`;
    c.width = Math.round(w * dpr);
    c.height = Math.round(height * dpr);
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    return { canvas: c, ctx, w, h: height };
  }

  html(cls, html) {
    return this.add(el('div', cls, html));
  }
}
