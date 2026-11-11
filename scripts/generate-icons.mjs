// Generate portable PNG icons without external dependencies.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
const table = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const tag = Buffer.from(type);
  const n = Buffer.alloc(4); n.writeUInt32BE(data.length);
  const sum = Buffer.alloc(4); sum.writeUInt32BE(crc32(Buffer.concat([tag, data])));
  return Buffer.concat([n, tag, data, sum]);
}
function distance(x, y, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
}
function create(size) {
  const image = Buffer.alloc(size * (1 + size * 4));
  const pts = [[.13,.52],[.30,.52],[.40,.35],[.53,.72],[.67,.42],[.74,.52],[.87,.52]];
  for (let y = 0; y < size; y++) {
    const row = y * (1 + size * 4);
    for (let x = 0; x < size; x++) {
      const px=x/size,py=y/size;
      let color=[10,23,42,255];
      const halo=Math.hypot(px-.5,py-.51);
      if (halo < .41) color=[16,35,59,255];
      const d=Math.min(...pts.slice(1).map((p,i)=>distance(px,py,...pts[i],...p)));
      if (d < .022) color=[92,186,248,255];
      if(Math.hypot(px-.87,py-.52)<.03) color=[72,221,171,255];
      const off=row+1+x*4;
      for(let k=0;k<4;k++)image[off+k]=color[k];
    }
  }
  const ihdr=Buffer.alloc(13); ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=6;
  const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(image,{level:9})),chunk('IEND',Buffer.alloc(0))]);
  writeFileSync(new URL('../public/icon-'+size+'.png',import.meta.url),png);
}
for(const n of [180,192,512])create(n);
