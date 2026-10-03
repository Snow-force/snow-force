from pathlib import Path
import pypdfium2 as pdfium,json
files=[Path('Products') / name for name in [
 '2026 雪服选货清单图册 - 8.10更新.pdf',
 '2026FW VECTOR儿童产品手册.pdf',
 '2026FW VECTOR成人产品手册.pdf',
 '26-27 BURTON softgoods-1222.pdf',
 'ISEE MIGGA 配件选款图册-26.2.4.pdf',
 'PSN_2026-27_Alpine_Collection(1).pdf',
 'REV 2026 产品手册(1).pdf',
]]
# Coordinates are fractions of the page, selected after visual inspection.
items=[('vector-insnow-dusk',2,13,(.057,.096,.308,.614)),('vector-voyager',2,15,(.057,.096,.308,.614)),('vector-rogue-kids',1,12,(.057,.096,.308,.614)),('vector-kids-colorblock',1,14,(.057,.096,.308,.614)),('burton-acamar-jacket',3,8,(.085,.12,.2,.37)),('burton-acamar-bib',3,8,(.605,.115,.695,.375)),('isee-barbie-set',0,2,(.11,.15,.36,.47)),('isee-monogram-set',0,3,(.11,.15,.36,.47)),('isee-magnetic-goggles',4,18,(.27,.21,.497,.733)),('isee-logo-gloves',4,35,(.037,.21,.264,.733)),('isee-down-liner',4,1,(.037,.21,.264,.733)),('isee-bunny-hoodie',4,3,(.037,.21,.34,.733)),('psn-aspen',5,3,(.034,.23,.186,.82)),('rev-f3-carbon',6,14,(.208,.12,.305,.29))]
out=Path('public/shop');out.mkdir(exist_ok=True)
manifest=[]
for slug,j,n,rect in items:
 doc=pdfium.PdfDocument(str(files[j]));im=doc[n-1].render(scale=2).to_pil().convert('RGB');w,h=im.size
 crop=im.crop(tuple(round(v*s) for v,s in zip(rect,[w,h,w,h])));crop.thumbnail((900,1100));crop.save(out/f'{slug}.webp',quality=88)
 im.thumbnail((1600,1600));im.save(out/f'{slug}-catalog.webp',quality=85)
 manifest.append({'slug':slug,'file':files[j].name,'page':n,'crop':rect})
doc=pdfium.PdfDocument(str(files[2]));im=doc[1].render(scale=2).to_pil().convert('RGB');im.thumbnail((2200,1500));im.save(out/'mountain-editorial.webp',quality=90)
doc=pdfium.PdfDocument(str(files[1]));im=doc[1].render(scale=1.5).to_pil().convert('RGB');im.thumbnail((1300,1000));im.save(out/'kids-editorial.webp',quality=88)
Path('scripts/shop/asset-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
