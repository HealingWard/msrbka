// История цен: сервер записывает цену товара при каждой проверке (поиск или открытие карточки).
// Хранится в JSON-файле; одна точка на товар в день (последняя цена дня).

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MAX_POINTS = 400;
const dayOf = (t) => new Date(t).toISOString().slice(0, 10);

export class PriceHistory {
  constructor(file) {
    this.file = file;
    this.data = {};
    this.timer = null;
    this.saving = Promise.resolve();
  }

  async load() {
    try {
      this.data = JSON.parse(await readFile(this.file, 'utf8'));
    } catch (e) {
      if (e.code !== 'ENOENT') console.warn('history: не удалось прочитать', this.file, e.message);
      this.data = {};
    }
    return this;
  }

  record(item, t = Date.now()) {
    if (!item || !item.id || !item.price) return;
    const rec = this.data[item.id] || (this.data[item.id] = { points: [] });
    rec.url = item.url;
    rec.title = item.title;
    rec.store = item.store;
    rec.old = item.old || null;
    const pts = rec.points;
    const last = pts[pts.length - 1];
    if (last && dayOf(last[0]) === dayOf(t)) { last[0] = t; last[1] = item.price; }
    else pts.push([t, item.price]);
    if (pts.length > MAX_POINTS) pts.splice(0, pts.length - MAX_POINTS);
    this.scheduleSave();
  }

  get(id) {
    const rec = this.data[id];
    return rec ? rec.points.map(([t, price]) => ({ t, price })) : [];
  }

  scheduleSave() {
    if (this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; this.save(); }, 2000);
  }

  save() {
    this.saving = this.saving.then(async () => {
      await mkdir(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      await writeFile(tmp, JSON.stringify(this.data));
      await rename(tmp, this.file);
    }).catch((e) => console.warn('history: не удалось сохранить', e.message));
    return this.saving;
  }
}
