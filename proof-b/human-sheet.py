import json,sys
from PIL import Image, ImageDraw, ImageFont
items=json.load(open('human-test-items.json')); font=ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",18)
def sheet(key,w,h,cols,scale,out):
    tiles=[Image.open(x[key]).convert('L').crop((0,0,w,h)).resize((int(w*scale),int(h*scale))) for x in items]
    tw,th=tiles[0].size; rows=(len(tiles)+cols-1)//cols; pad=18; lab=28
    s=Image.new('L',(cols*tw+(cols+1)*pad, rows*(th+lab+pad)+pad),225); d=ImageDraw.Draw(s)
    for i,t in enumerate(tiles):
        x=pad+(i%cols)*(tw+pad); y=pad+(i//cols)*(th+lab+pad); d.text((x,y),f"{i+1:02d}",fill=30,font=font); s.paste(t,(x,y+lab))
    s.save(out,optimize=True); print(out,s.size)
sheet('f1280',1280,800,5,0.3,'human-test-1280-gray-unlabeled.png'); sheet('f390',390,844,10,0.45,'human-test-390-gray-unlabeled.png')
