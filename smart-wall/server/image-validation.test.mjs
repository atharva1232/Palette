import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { validateStoredImages } from './image-validation.mjs';
test('Complete PNG/JPEG/WebP photos decode and match their preview dimensions', async () => {
 const image=()=>sharp({create:{width:80,height:40,channels:3,background:'#713343'}});
 const preview=await image().png().toBuffer();
 for(const format of ['png','jpeg','webp']) await validateStoredImages({photo:await image().toFormat(format).toBuffer(),preview});
});
test('Truncated originals, header-only previews and mismatched sizes fail', async () => {
 const valid=await sharp({create:{width:2,height:1,channels:3,background:'#ffffff'}}).png().toBuffer();
 const other=await sharp({create:{width:1,height:1,channels:3,background:'#ffffff'}}).png().toBuffer();
 for(const d of [{photo:valid.subarray(0,8),preview:valid},{photo:valid,preview:valid.subarray(0,24)},{photo:valid,preview:other}]) await assert.rejects(()=>validateStoredImages(d),error=>error.status===400);
});
test('Bundled real room decodes with the browser preview dimensions', async () => {
 const {readFile}=await import('node:fs/promises');const photo=await readFile(new URL('../public/images/lounge.jpg',import.meta.url));
 const preview=await sharp(photo).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).png().toBuffer();
 await validateStoredImages({photo,preview});
});
