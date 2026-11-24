const BASE = new URL('/assets/pet/', location.href);

function loadImage(path) {
  const image = new Image();
  image.src = new URL(path, BASE);
  return image.decode().then(() => image);
}

export async function loadAssets() {
  const response = await fetch(new URL('manifest.json', BASE));
  if (!response.ok) throw new Error('无法打开宠物素材清单');
  const manifest = await response.json();
  const layers = {};
  await Promise.all(Object.entries(manifest.layers).map(async ([key, value]) => {
    layers[key] = { ...value, image: value.src ? await loadImage(value.src) : null };
  }));
  const states = {};
  await Promise.all(Object.entries(manifest.states).map(async ([key, value]) => {
    states[key] = { ...value, images: await Promise.all(value.frames.map(loadImage)) };
  }));
  return { ...manifest, layers, states };
}
