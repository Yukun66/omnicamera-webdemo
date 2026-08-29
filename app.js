const LEGACY_ROOT = 'video/1月17日 (1)(2)/1月17日 (1)(2)-';
const TEXT_V2V_ROOT = 'video/1. Text-controlled V2V/';

const makeLegacy = (start, end, label) => Array.from({ length: end - start + 1 }, (_, index) => ({
  src: `${LEGACY_ROOT}${start + index}.mp4`,
  label: `${label} · Example ${index + 1}`,
}));

const makeTextV2V = (command, numbers) => numbers.map((number, index) => ({
  src: `${TEXT_V2V_ROOT}${command}/【文本控制】【V2V】 (${number}).mp4`,
  label: `${command} · Example ${index + 1}`,
  command,
}));

const MODES = {
  'text-v2v': {
    index: '01',
    title: 'Text-controlled V2V',
    description: 'Re-camera an existing video with natural-language camera commands while preserving the source content.',
    items: [
      ...makeTextV2V('Dolly in', [65, 66, 67, 68, 69]),
      ...makeTextV2V('Orbiting Right-Up', [82, 83, 84, 85, 86]),
      ...makeTextV2V('Roll Counterclockwise', [93, 94, 95, 96, 97]),
    ],
  },
  'trajectory-v2v': {
    index: '02',
    title: 'Trajectory-controlled V2V',
    description: 'Apply an explicit, repeatable 3D camera path to an existing video.',
    items: makeLegacy(6, 9, 'Trajectory · V2V'),
  },
  'reference-v2v': {
    index: '03',
    title: 'Reference-video-controlled V2V',
    description: 'Transfer camera movement from a motion reference video to source-video content.',
    items: makeLegacy(10, 14, 'Reference video · V2V'),
  },
  'text-i2v': {
    index: '04',
    title: 'Text-controlled I2V',
    description: 'Animate a single image while following a natural-language camera instruction.',
    items: makeLegacy(15, 19, 'Motion text · I2V'),
  },
  'trajectory-i2v': {
    index: '05',
    title: 'Trajectory-controlled I2V',
    description: 'Generate from one image with precise camera movement defined by a 3D trajectory.',
    items: makeLegacy(20, 22, 'Trajectory · I2V'),
  },
  'reference-i2v': {
    index: '06',
    title: 'Reference-video-controlled I2V',
    description: 'Animate an image with the camera dynamics demonstrated by a reference video.',
    items: makeLegacy(23, 25, 'Reference video · I2V'),
  },
  'text-t2v': {
    index: '07',
    title: 'Text-controlled T2V',
    description: 'Create scene content and specify camera behavior through natural language.',
    items: makeLegacy(26, 29, 'Motion text · T2V'),
  },
  'trajectory-t2v': {
    index: '08',
    title: 'Trajectory-controlled T2V',
    description: 'Generate a new video that follows a deterministic rotation-and-translation camera path.',
    items: makeLegacy(30, 31, 'Trajectory · T2V'),
  },
  'reference-t2v': {
    index: '09',
    title: 'Reference-video-controlled T2V',
    description: 'Reproduce complex camera dynamics from a reference while generating new prompted content.',
    items: makeLegacy(32, 33, 'Reference video · T2V'),
  },
};

const gallery = document.querySelector('#videoGallery');
const commandFilters = document.querySelector('#commandFilters');
const modeTabs = [...document.querySelectorAll('[data-mode]')];
const cameraButtons = [...document.querySelectorAll('[data-camera]')];
const contentButtons = [...document.querySelectorAll('[data-content]')];
const conditionVideo = document.querySelector('#conditionVideo');
const featuredConditionControls = {
  camera: {
    prev: document.querySelector('#featuredCameraPrev'),
    next: document.querySelector('#featuredCameraNext'),
    counter: document.querySelector('#featuredCameraCounter'),
    rail: document.querySelector('#featuredCameraRail'),
  },
  content: {
    prev: document.querySelector('#featuredContentPrev'),
    next: document.querySelector('#featuredContentNext'),
    counter: document.querySelector('#featuredContentCounter'),
    rail: document.querySelector('#featuredContentRail'),
  },
};
const resultPanel = document.querySelector('#resultPanel');
const resultCount = document.querySelector('#resultCount');
const galleryEmptyState = document.querySelector('#galleryEmptyState');
const featuredResultControls = {
  prev: document.querySelector('#featuredResultPrev'),
  next: document.querySelector('#featuredResultNext'),
  counter: document.querySelector('#featuredResultCounter'),
  status: document.querySelector('#featuredBrowseStatus'),
  clear: document.querySelector('#featuredClearFilter'),
};
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let videoObserver;
let activeMode = 'text-v2v';
let activeCommand = 'all';
let featuredSelection = { camera: null, content: null };
let featuredResultIndex = 0;
let featuredFilter = { kind: 'all', key: null };
const featuredGraphCache = new WeakMap();

const CAMERA_LABELS = {
  text: 'Motion Text',
  trajectory: '3D Trajectory',
  reference: 'Reference Video',
};

const CONTENT_LABELS = {
  t2v: 'Text Prompt',
  i2v: 'Image',
  v2v: 'Source Video',
};

function escapeHTML(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function conditionFor(item, key, kind) {
  if (item[kind]) return item[kind];
  const [camera, content] = key.split('-');
  if (kind === 'camera' && camera === 'text' && item.command) {
    return { kind: 'text', text: item.command };
  }
  const expected = kind === 'camera'
    ? ({ text: 'camera.txt', trajectory: 'camera.png', reference: 'camera.mp4' })[camera]
    : ({ t2v: 'content.txt', i2v: 'content.jpg', v2v: 'content.mp4' })[content];
  return { kind: 'missing', expected };
}

function conditionMarkup(condition, eager = false) {
  if (condition?.kind === 'text' && condition.text) {
    return `<p class="condition-text">${escapeHTML(condition.text)}</p>`;
  }
  if (condition?.kind === 'image' && condition.src) {
    return `<img src="${escapeHTML(condition.src)}" alt="Condition preview" loading="lazy">`;
  }
  if (condition?.kind === 'video' && condition.src) {
    const source = escapeHTML(condition.src);
    return eager
      ? `<video src="${source}" muted autoplay loop playsinline preload="metadata" aria-label="Condition preview"></video>`
      : `<video muted loop playsinline preload="none" data-src="${source}" aria-label="Condition preview"></video>`;
  }
  const expected = escapeHTML(condition?.expected || 'condition file');
  return `<div class="condition-placeholder"><i aria-hidden="true">＋</i><span>Add <strong>${expected}</strong></span></div>`;
}

function outputFor(item) {
  return item.output?.src || item.src;
}

function numberedPosition(item, index) {
  const folderNumber = Number.parseInt(String(item.id || '').match(/^\d+/)?.[0], 10);
  return Number.isFinite(folderNumber) ? folderNumber : index + 1;
}

function setPlayingState(video) {
  const shell = video.closest('.video-shell');
  const button = shell?.querySelector('.play-toggle');
  const playing = !video.paused && !video.ended;
  shell?.classList.toggle('is-playing', playing);
  if (button) {
    button.setAttribute('aria-label', playing ? `Pause ${video.dataset.label}` : `Play ${video.dataset.label}`);
    button.querySelector('span').textContent = playing ? 'Ⅱ' : '▶';
  }
}

function loadVideo(video) {
  if (!video.src && video.dataset.src) {
    video.src = video.dataset.src;
    video.load();
  }
}

function observeVideos() {
  videoObserver?.disconnect();
  videoObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const video = entry.target;
      if (entry.isIntersecting) {
        loadVideo(video);
        if (!reducedMotion.matches && video.dataset.manualPause !== 'true') {
          video.play().catch(() => {});
        }
      } else {
        video.pause();
      }
    });
  }, { threshold: 0.45, rootMargin: '120px 0px' });

  gallery.querySelectorAll('video').forEach((video) => {
    video.addEventListener('play', () => setPlayingState(video));
    video.addEventListener('pause', () => setPlayingState(video));
    videoObserver.observe(video);
  });
}

function conditionNamesFor(item, key) {
  const camera = conditionFor(item, key, 'camera');
  const content = conditionFor(item, key, 'content');
  const [cameraKey, contentKey] = key.split('-');
  return {
    cameraName: item.cameraMotion?.label
      || (camera.kind === 'text' ? camera.text : null)
      || item.cameraRef?.toUpperCase()
      || CAMERA_LABELS[cameraKey],
    contentName: item.contentLabel
      || (content.kind === 'text' ? content.text : null)
      || item.contentRef?.toUpperCase()
      || CONTENT_LABELS[contentKey],
  };
}

function videoCard(item, index) {
  const src = escapeHTML(outputFor(item));
  const camera = conditionFor(item, activeMode, 'camera');
  const content = conditionFor(item, activeMode, 'content');
  const [cameraKey, contentKey] = activeMode.split('-');
  const cameraType = cameraKey !== 'text' && item.cameraMotion?.label
    ? item.cameraMotion.label
    : CAMERA_LABELS[cameraKey];
  const contentType = item.contentLabel
    ? `${CONTENT_LABELS[contentKey]} · ${item.contentLabel}`
    : CONTENT_LABELS[contentKey];
  const { cameraName, contentName } = conditionNamesFor(item, activeMode);
  const safeCameraName = escapeHTML(cameraName);
  const safeContentName = escapeHTML(contentName);
  const combinedName = escapeHTML(`${cameraName} × ${contentName}`);
  const detail = escapeHTML(`${CAMERA_LABELS[cameraKey]} camera control · ${CONTENT_LABELS[contentKey]} content`);
  const folderNumber = String(item.id || '').match(/^\d+/)?.[0];
  const displayNumber = folderNumber || String(index + 1).padStart(2, '0');
  return `
    <article class="video-card">
      <div class="demo-card-body">
        <div class="demo-inputs">
          <section class="demo-input camera-${escapeHTML(cameraKey)}">
            <div class="demo-input-head"><span>Camera condition</span><b>${escapeHTML(cameraType)}</b></div>
            <div class="condition-media">${conditionMarkup(camera)}</div>
          </section>
          <section class="demo-input">
            <div class="demo-input-head"><span>Content condition</span><b>${escapeHTML(contentType)}</b></div>
            <div class="condition-media">${conditionMarkup(content)}</div>
          </section>
        </div>
        <div class="video-shell">
          <video muted playsinline loop preload="none" data-src="${src}" data-label="${combinedName}" aria-label="Generated result: ${combinedName}"></video>
          <button class="play-toggle" type="button" aria-label="Play ${combinedName}"><span aria-hidden="true">▶</span></button>
        </div>
      </div>
      <div class="video-meta"><div><strong class="condition-combination-title"><span class="condition-camera-name" title="${safeCameraName}">${safeCameraName}</span><i aria-hidden="true">×</i><span class="condition-content-name" title="${safeContentName}">${safeContentName}</span></strong><small>${detail}</small></div><span>Condition → Result · ${displayNumber}</span></div>
    </article>`;
}

function renderGallery(items) {
  videoObserver?.disconnect();
  gallery.innerHTML = items.map(videoCard).join('');
  gallery.scrollLeft = 0;
  gallery.querySelectorAll('.video-shell').forEach((shell) => {
    shell.addEventListener('click', () => {
      const video = shell.querySelector('video');
      loadVideo(video);
      if (video.paused) {
        video.dataset.manualPause = 'false';
        video.play().catch(() => {});
      } else {
        video.dataset.manualPause = 'true';
        video.pause();
      }
    });
  });
  observeVideos();
}

function renderCommandFilters(items) {
  const commands = [...new Set(items.map((item) => item.command).filter(Boolean))];
  if (commands.length <= 1) {
    commandFilters.innerHTML = '';
    return commands;
  }
  commandFilters.innerHTML = `<button type="button" class="${activeCommand === 'all' ? 'active' : ''}" data-command="all">All</button>` + commands.map((command) => {
    const safeCommand = escapeHTML(command);
    return `<button type="button" class="${command === activeCommand ? 'active' : ''}" data-command="${safeCommand}">${safeCommand}</button>`;
  }).join('');
  commandFilters.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => {
      activeCommand = button.dataset.command;
      renderCommandFilters(items);
      const visibleItems = activeCommand === 'all' ? items : items.filter((item) => item.command === activeCommand);
      renderGallery(visibleItems);
      updateResultCount(visibleItems.length, items.length, MODES[activeMode].items.length);
    });
  });
  return commands;
}

function updateResultCount(visibleCount, galleryCount, totalCount) {
  resultCount.textContent = activeCommand === 'all'
    ? `${totalCount} total · all available in gallery`
    : `${visibleCount} shown · ${totalCount} total`;
}

function conditionIdentity(item, kind) {
  if (!item) return 'missing';
  if (kind === 'camera' && item.cameraMotion?.group) return `motion:${item.cameraMotion.group}`;
  const reference = kind === 'camera' ? item.cameraRef : item.contentRef;
  if (reference) return `ref:${reference}`;
  const condition = conditionFor(item, activeMode, kind);
  if (condition.kind === 'text') return `text:${condition.text || ''}`;
  if (condition.src) return `src:${condition.src}`;
  return 'missing';
}

function featuredGraphFor(mode) {
  const cached = featuredGraphCache.get(mode.items);
  if (cached) return cached;

  const completeItems = mode.items.filter((item) => (
    conditionIdentity(item, 'camera') !== 'missing'
    && conditionIdentity(item, 'content') !== 'missing'
  ));
  const cameraKeys = [...new Set(completeItems.map((item) => conditionIdentity(item, 'camera')))];
  const contentKeys = [...new Set(completeItems.map((item) => conditionIdentity(item, 'content')))];
  const cameraItems = new Map(cameraKeys.map((key) => [key, []]));
  const contentItems = new Map(contentKeys.map((key) => [key, []]));
  completeItems.forEach((item) => {
    const cameraKey = conditionIdentity(item, 'camera');
    const contentKey = conditionIdentity(item, 'content');
    cameraItems.get(cameraKey).push(item);
    contentItems.get(contentKey).push(item);
  });
  const graph = {
    items: completeItems,
    cameraKeys,
    contentKeys,
    cameraItems,
    contentItems,
    defaultItem: completeItems[0] || null,
  };
  featuredGraphCache.set(mode.items, graph);
  return graph;
}

function galleryItemsFor(mode) {
  return mode.items;
}

function featuredPool(graph) {
  if (featuredFilter.kind === 'camera') return graph.cameraItems.get(featuredFilter.key) || [];
  if (featuredFilter.kind === 'content') return graph.contentItems.get(featuredFilter.key) || [];
  return graph.items;
}

function setFeaturedFromItem(item) {
  featuredSelection.camera = conditionIdentity(item, 'camera');
  featuredSelection.content = conditionIdentity(item, 'content');
}

function representativeItemForChoice(graph, kind, choice, currentItem) {
  if (currentItem && conditionIdentity(currentItem, kind) === choice) return currentItem;
  const groups = kind === 'camera' ? graph.cameraItems : graph.contentItems;
  return groups.get(choice)?.[0] || null;
}

function conditionRailPreview(item, kind) {
  const condition = conditionFor(item || {}, activeMode, kind);
  if (condition.kind === 'text') {
    return `<span class="condition-rail-text">${escapeHTML(condition.text || 'Text')}</span>`;
  }
  if (condition.kind === 'image' && condition.src) {
    return `<img src="${escapeHTML(condition.src)}" alt="" loading="lazy">`;
  }
  if (condition.kind === 'video' && condition.src) {
    return `<video src="${escapeHTML(condition.src)}" muted playsinline preload="metadata" tabindex="-1"></video><i aria-hidden="true">▶</i>`;
  }
  return '<span class="condition-rail-text">Missing</span>';
}

function conditionChoiceLabel(item, kind, index) {
  const reference = kind === 'camera' ? item?.cameraRef : item?.contentRef;
  const condition = conditionFor(item || {}, activeMode, kind);
  if (kind === 'camera' && item?.cameraMotion?.groupLabel) return item.cameraMotion.groupLabel;
  if (kind === 'content' && item?.contentLabel) return item.contentLabel;
  if (condition.kind === 'text' && condition.text) return condition.text;
  return reference?.toUpperCase() || `${kind === 'camera' ? 'Camera' : 'Content'} ${index + 1}`;
}

function renderConditionRail(graph, kind, choices, currentItem) {
  const rail = featuredConditionControls[kind].rail;
  rail.innerHTML = choices.map((choice, index) => {
    const item = representativeItemForChoice(graph, kind, choice, currentItem);
    const label = conditionChoiceLabel(item, kind, index);
    const isFiltered = featuredFilter.kind === kind && featuredFilter.key === choice;
    return `<button type="button" aria-label="Show results for ${escapeHTML(label)}" aria-current="${choice === featuredSelection[kind]}" aria-pressed="${isFiltered}" class="${isFiltered ? 'is-filtered' : ''}">
      <span class="condition-rail-preview">${conditionRailPreview(item, kind)}</span>
      <small>${escapeHTML(label)}</small>
    </button>`;
  }).join('');
  rail.querySelectorAll('button').forEach((button, index) => {
    button.addEventListener('click', () => {
      featuredFilter = { kind, key: choices[index] };
      featuredResultIndex = 0;
      syncConditionLab(activeMode);
    });
  });
  requestAnimationFrame(() => rail.querySelector('[aria-current="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' }));
}

function renderFeaturedConditionControls(graph, currentItem) {
  ['camera', 'content'].forEach((kind) => {
    const choices = kind === 'camera' ? graph.cameraKeys : graph.contentKeys;
    const currentIndex = Math.max(choices.indexOf(featuredSelection[kind]), 0);
    const controls = featuredConditionControls[kind];
    controls.counter.textContent = choices.length
      ? `${String(currentIndex + 1).padStart(2, '0')} / ${String(choices.length).padStart(2, '0')}`
      : '00 / 00';
    controls.prev.disabled = choices.length <= 1;
    controls.next.disabled = choices.length <= 1;
    renderConditionRail(graph, kind, choices, currentItem);
  });
}

function cycleFeaturedCondition(kind, direction) {
  const graph = featuredGraphFor(MODES[activeMode]);
  const choices = kind === 'camera' ? graph.cameraKeys : graph.contentKeys;
  if (choices.length <= 1) return;
  const currentIndex = Math.max(choices.indexOf(featuredSelection[kind]), 0);
  featuredFilter = { kind, key: choices[(currentIndex + direction + choices.length) % choices.length] };
  featuredResultIndex = 0;
  syncConditionLab(activeMode);
}

function cycleFeaturedResult(direction) {
  const graph = featuredGraphFor(MODES[activeMode]);
  const pool = featuredPool(graph);
  if (pool.length <= 1) return;
  featuredResultIndex = (featuredResultIndex + direction + pool.length) % pool.length;
  syncConditionLab(activeMode);
}

function clearFeaturedFilter() {
  const graph = featuredGraphFor(MODES[activeMode]);
  const currentItem = featuredPool(graph)[featuredResultIndex];
  featuredFilter = { kind: 'all', key: null };
  featuredResultIndex = Math.max(graph.items.indexOf(currentItem), 0);
  syncConditionLab(activeMode);
}

function syncConditionLab(key) {
  const mode = MODES[key];
  if (!mode) return;
  const [camera, content] = key.split('-');
  cameraButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.camera === camera)));
  contentButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.content === content)));
  document.querySelector('#conditionCameraLabel').textContent = CAMERA_LABELS[camera];
  document.querySelector('#conditionContentLabel').textContent = CONTENT_LABELS[content];
  document.querySelector('#featuredCameraType').textContent = CAMERA_LABELS[camera];
  document.querySelector('#featuredContentType').textContent = CONTENT_LABELS[content];
  const graph = featuredGraphFor(mode);
  let pool = featuredPool(graph);
  if (!pool.length && graph.defaultItem) {
    featuredFilter = { kind: 'all', key: null };
    featuredResultIndex = 0;
    pool = graph.items;
  }
  if (featuredResultIndex >= pool.length) featuredResultIndex = 0;
  const featured = pool[featuredResultIndex] || graph.defaultItem;
  if (featured) setFeaturedFromItem(featured);
  renderFeaturedConditionControls(graph, featured);
  featuredResultControls.counter.textContent = pool.length
    ? `${String(featuredResultIndex + 1).padStart(2, '0')} / ${String(pool.length).padStart(2, '0')}`
    : '00 / 00';
  featuredResultControls.prev.disabled = pool.length <= 1;
  featuredResultControls.next.disabled = pool.length <= 1;
  featuredResultControls.clear.disabled = featuredFilter.kind === 'all';
  if (featuredFilter.kind === 'all') {
    featuredResultControls.status.textContent = 'All available results';
  } else {
    const index = featuredFilter.kind === 'camera'
      ? graph.cameraKeys.indexOf(featuredFilter.key)
      : graph.contentKeys.indexOf(featuredFilter.key);
    const label = conditionChoiceLabel(featured, featuredFilter.kind, Math.max(index, 0));
    featuredResultControls.status.textContent = `${featuredFilter.kind === 'camera' ? 'Camera' : 'Content'} fixed · ${label}`;
  }
  if (!featured) {
    document.querySelector('#conditionTitle').textContent = 'No compatible condition set yet';
    document.querySelector('#conditionDescription').textContent = 'Results with missing Camera or Content conditions remain available below.';
    document.querySelector('#featuredCameraCondition').innerHTML = conditionMarkup(conditionFor({}, key, 'camera'), true);
    document.querySelector('#featuredContentCondition').innerHTML = conditionMarkup(conditionFor({}, key, 'content'), true);
    conditionVideo.dataset.src = '';
    conditionVideo.removeAttribute('src');
    conditionVideo.load();
    return;
  }
  const featuredNames = conditionNamesFor(featured, key);
  document.querySelector('#conditionTitle').innerHTML = `<span class="condition-camera-name">${escapeHTML(featuredNames.cameraName)}</span><i aria-hidden="true">×</i><span class="condition-content-name">${escapeHTML(featuredNames.contentName)}</span>`;
  document.querySelector('#conditionDescription').textContent = featured.description || mode.description;
  document.querySelector('#featuredCameraType').textContent = camera !== 'text' && featured.cameraMotion?.label
    ? `${CAMERA_LABELS[camera]} · ${featured.cameraMotion.label}`
    : CAMERA_LABELS[camera];
  const selectedContentLabel = featured.contentLabel
    ? `${CONTENT_LABELS[content]} · ${featured.contentLabel}`
    : CONTENT_LABELS[content];
  document.querySelector('#featuredContentType').textContent = selectedContentLabel;
  document.querySelector('#featuredCameraCondition').innerHTML = conditionMarkup(conditionFor(featured, key, 'camera'), true);
  document.querySelector('#featuredContentCondition').innerHTML = conditionMarkup(conditionFor(featured, key, 'content'), true);
  const output = outputFor(featured);
  if (conditionVideo.dataset.src === output) return;
  conditionVideo.dataset.src = output;
  conditionVideo.src = output;
  conditionVideo.setAttribute('aria-label', `${mode.title}: ${featured.label}`);
  conditionVideo.load();
  if (!reducedMotion.matches) conditionVideo.play().catch(() => {});
}

function selectMode(key, shouldScroll = false) {
  const mode = MODES[key];
  if (!mode) return;
  if (activeMode !== key) {
    featuredSelection = { camera: null, content: null };
    featuredResultIndex = 0;
    featuredFilter = { kind: 'all', key: null };
    activeCommand = 'all';
  }
  activeMode = key;
  modeTabs.forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.mode === key)));
  document.querySelector('#resultIndex').textContent = `${mode.index} / 09`;
  document.querySelector('#resultTitle').textContent = mode.title;
  document.querySelector('#resultDescription').textContent = mode.description;
  const galleryItems = galleryItemsFor(mode);
  const commands = [...new Set(galleryItems.map((item) => item.command).filter(Boolean))];
  if (activeCommand !== 'all' && !commands.includes(activeCommand)) activeCommand = 'all';
  syncConditionLab(key);
  renderCommandFilters(galleryItems);
  const visibleItems = activeCommand === 'all' ? galleryItems : galleryItems.filter((item) => item.command === activeCommand);
  renderGallery(visibleItems);
  updateResultCount(visibleItems.length, galleryItems.length, mode.items.length);
  resultPanel.hidden = galleryItems.length === 0;
  galleryEmptyState.hidden = galleryItems.length !== 0;
  if (shouldScroll) document.querySelector('#results').scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth' });
}

modeTabs.forEach((tab) => tab.addEventListener('click', () => selectMode(tab.dataset.mode)));
document.querySelectorAll('[data-mode-target]').forEach((cell) => cell.addEventListener('click', () => selectMode(cell.dataset.modeTarget, true)));
cameraButtons.forEach((button) => button.addEventListener('click', () => {
  const content = activeMode.split('-')[1];
  selectMode(`${button.dataset.camera}-${content}`);
}));
contentButtons.forEach((button) => button.addEventListener('click', () => {
  const camera = activeMode.split('-')[0];
  selectMode(`${camera}-${button.dataset.content}`);
}));

featuredConditionControls.camera.prev.addEventListener('click', () => cycleFeaturedCondition('camera', -1));
featuredConditionControls.camera.next.addEventListener('click', () => cycleFeaturedCondition('camera', 1));
featuredConditionControls.content.prev.addEventListener('click', () => cycleFeaturedCondition('content', -1));
featuredConditionControls.content.next.addEventListener('click', () => cycleFeaturedCondition('content', 1));
featuredResultControls.prev.addEventListener('click', () => cycleFeaturedResult(-1));
featuredResultControls.next.addEventListener('click', () => cycleFeaturedResult(1));
featuredResultControls.clear.addEventListener('click', clearFeaturedFilter);
Object.values(featuredConditionControls).forEach((controls) => {
  controls.rail.addEventListener('wheel', (event) => {
    if (controls.rail.scrollWidth <= controls.rail.clientWidth || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    controls.rail.scrollLeft += event.deltaY;
  }, { passive: false });
});

document.querySelector('#galleryPrev').addEventListener('click', () => gallery.scrollBy({ left: -gallery.clientWidth * 0.75, behavior: 'smooth' }));
document.querySelector('#galleryNext').addEventListener('click', () => gallery.scrollBy({ left: gallery.clientWidth * 0.75, behavior: 'smooth' }));

document.querySelector('#copyCitation').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  try {
    await navigator.clipboard.writeText(document.querySelector('#citationCode').textContent);
    button.textContent = 'Copied';
  } catch {
    button.textContent = 'Select & copy';
  }
  window.setTimeout(() => { button.textContent = 'Copy BibTeX'; }, 1800);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) gallery.querySelectorAll('video').forEach((video) => video.pause());
});

window.addEventListener('scroll', () => document.querySelector('.site-header').classList.toggle('scrolled', window.scrollY > 8), { passive: true });

selectMode(activeMode);

async function hydrateVideoManifest() {
  try {
    const response = await fetch('data/video-manifest.json', { cache: 'no-store' });
    if (!response.ok) return;
    const manifest = await response.json();
    Object.keys(MODES).forEach((key) => {
      const demoItems = manifest.modes?.[key];
      if (Array.isArray(demoItems) && demoItems.length) {
        MODES[key].items = demoItems;
        MODES[key].featured = demoItems[0];
        return;
      }
      const showcaseItems = manifest.showcase?.[key];
      const galleryItems = manifest.gallery?.[key];
      if (Array.isArray(showcaseItems) && showcaseItems.length) MODES[key].featured = showcaseItems[0];
      if (Array.isArray(galleryItems) && galleryItems.length) MODES[key].items = galleryItems;
    });
    featuredSelection = { camera: null, content: null };
    featuredResultIndex = 0;
    featuredFilter = { kind: 'all', key: null };
    selectMode(activeMode);
  } catch (error) {
    console.info('Using bundled demo videos because no custom manifest was found.', error);
  }
}

hydrateVideoManifest();
