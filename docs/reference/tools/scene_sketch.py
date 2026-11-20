"""Phác bố cục 'Thế giới cổ tích' theo ảnh mẫu A1–A3, chỉ dùng elip, đa giác, gradient, trộn alpha.
Toạ độ trên khung 1280x720. Chạy: python scene_sketch.py  -> layout_day.png, layout_night.png, layout_labeled.png"""
import math, random
from PIL import Image, ImageDraw, ImageFont
W, H, S = 1280, 720, 2  # S: supersample cho ảnh phác mượt

P = {  # (ngày, đêm)
 'skyTop':((92,168,232),(8,18,52)), 'skyBot':((222,240,240),(46,58,112)),
 'mountFar':((168,196,226),(40,54,100)), 'mountNear':((122,160,190),(28,42,80)),
 'forestFar':((110,165,145),(22,44,62)), 'forestNear':((72,135,100),(16,34,44)),
 'hill':((132,192,104),(26,52,48)), 'ground':((126,186,92),(30,56,48)), 'groundDark':((88,150,72),(20,42,38)),
 'path':((232,198,142),(112,106,128)), 'pathDark':((205,165,112),(86,82,104)),
 'trunk':((128,84,50),(56,42,42)), 'trunkDark':((88,56,34),(34,26,30)), 'trunkLight':((168,118,74),(82,62,58)), 'moss':((112,152,72),(36,60,46)),
 'canopyDark':((52,116,62),(14,38,36)), 'canopy':((92,162,76),(24,58,46)), 'canopyLight':((158,208,98),(44,84,62)),
 'cap':((214,72,62),(112,42,52)), 'capDark':((160,46,46),(70,26,36)), 'spot':((250,236,212),(172,160,152)),
 'stem':((246,233,212),(132,122,118)), 'stemShade':((214,194,170),(100,92,96)),
 'door':((168,112,62),(82,56,42)), 'window':((236,214,170),(255,206,112)), 'brick':((180,110,80),(80,52,48)),
 'wood':((178,122,72),(86,62,52)), 'woodDark':((122,80,46),(54,40,36)),
 'stone':((184,180,176),(88,94,116)), 'stoneDark':((136,132,130),(60,66,88)),
 'waterShallow':((142,206,216),(26,60,96)), 'waterDeep':((82,152,186),(12,34,66)), 'waterHi':((232,248,250),(150,172,204)),
 'leafFg':((42,98,62),(10,30,32)), 'leafFg2':((64,128,74),(16,40,40)),
 'flowerW':((252,250,240),(150,150,170)), 'flowerY':((248,206,70),(150,130,70)),
 'rabbit':((246,240,234),(150,148,160)), 'cloud':((252,252,255),(70,78,118)), 'cloudShade':((214,228,242),(48,56,92)),
}
def pc(k, night): return P[k][1 if night else 0]

def render(night=False, labels=False):
    base = Image.new('RGBA', (W*S, H*S))
    # bầu trời: gradient từng dải ngang
    d = ImageDraw.Draw(base)
    a, b = pc('skyTop', night), pc('skyBot', night)
    for y in range(0, 470*S):
        t = y/(470*S); d.line([(0,y),(W*S,y)], fill=tuple(int(a[i]+(b[i]-a[i])*t) for i in range(3))+(255,))
    L = Image.new('RGBA', base.size); ld = ImageDraw.Draw(L)
    def flush():
        nonlocal L, ld
        base.alpha_composite(L); L = Image.new('RGBA', base.size); ld = ImageDraw.Draw(L)
    def ell(cx,cy,rx,ry,c,al=255): ld.ellipse([(cx-rx)*S,(cy-ry)*S,(cx+rx)*S,(cy+ry)*S], fill=c+(al,))
    def poly(pts,c,al=255): ld.polygon([(x*S,y*S) for x,y in pts], fill=c+(al,))
    def line(pts,c,w,al=255): ld.line([(x*S,y*S) for x,y in pts], fill=c+(al,), width=int(w*S), joint='curve')
    def glow(cx,cy,r,c,n=4,amax=110):
        for i in range(n,0,-1):
            g = Image.new('RGBA', base.size); gd = ImageDraw.Draw(g); rr = r*(1+i*0.55)
            gd.ellipse([(cx-rr)*S,(cy-rr)*S,(cx+rr)*S,(cy+rr)*S], fill=c+(int(amax/(i+1)),)); base.alpha_composite(g)
    rnd = random.Random(7)
    # sao, mặt trời / mặt trăng
    if night:
        for _ in range(110):
            x,y = rnd.randint(0,W), rnd.randint(0,420); s = rnd.choice([1,1,1,2])
            ld.rectangle([x*S,y*S,(x+s)*S,(y+s)*S], fill=(255,250,225,rnd.randint(140,255)))
        flush(); glow(1188,150,30,(220,225,255),4,90)
        ell(1188,150,30,30,(250,244,214)); ell(1176,140,6,6,(220,212,186)); ell(1196,160,5,5,(220,212,186)); ell(1194,138,3,3,(220,212,186))
    else:
        flush(); glow(1188,85,34,(255,240,170),5,120); ell(1188,85,34,34,(255,248,214))
    # mây
    for cx,cy,s in ([(1010,282,1.0),(1236,222,0.9),(745,238,0.7),(470,120,0.6)]):
        for dx,dy,rx,ry in [(-46,10,40,20),(-10,-6,46,30),(34,4,40,24),(0,16,74,16)]:
            ell(cx+dx*s,cy+dy*s,rx*s,ry*s,pc('cloud',night), 235 if not night else 200)
        ell(cx,cy+18*s,70*s,8*s,pc('cloudShade',night),220)
    flush()
    # núi
    poly([(900,430),(1010,330),(1090,300),(1188,280),(1280,302),(1280,430)], pc('mountFar',night))
    poly([(1080,430),(1188,282),(1230,330),(1280,330),(1280,430)], pc('mountNear',night),120)
    # rừng nền: thông xa + tán tròn
    for i in range(30):
        x = 540 + i*24 + rnd.randint(-8,8); h = rnd.randint(70,130); bt = 440
        poly([(x-18,bt),(x,bt-h),(x+18,bt)], pc('forestFar',night))
    for i in range(8):
        x = 10 + i*28; h = rnd.randint(260,380); poly([(x-24,470),(x,470-h),(x+24,470)], pc('forestFar',night))
    for x,y,r in [(820,400,40),(900,395,36),(1050,410,44),(1130,400,38),(1240,395,46),(700,420,40),(620,410,36)]:
        ell(x,y,r,r*0.8,pc('forestNear',night))
    poly([(1140,480),(1180,410),(1280,380),(1280,480)], pc('hill',night))
    flush()
    # mặt đất
    poly([(0,470),(160,450),(420,470),(700,455),(900,470),(1280,462),(1280,720),(0,720)], pc('ground',night))
    poly([(0,560),(300,600),(700,640),(1000,660),(1280,640),(1280,720),(0,720)], pc('groundDark',night),110)
    # hồ
    ell(1010,520,300,16,pc('groundDark',night))
    ell(1010,590,300,66,pc('waterShallow',night)); ell(1030,598,240,46,pc('waterDeep',night))
    for i in range(10):
        y = 562 + i*8; x = 820 + rnd.randint(0,360); line([(x,y),(x+rnd.randint(20,50),y)], pc('waterHi',night), 2, 170)
    if night:
        for k in range(6): ell(1188, 560+k*13, 26-k*3, 3, (240,236,200), 200-k*25)
    flush()
    # đá ven hồ + cầu
    for x,y,rx,ry in [(735,540,42,20),(826,526,32,16),(872,532,14,8),(1186,506,48,24),(1136,526,22,11)]:
        ell(x,y+ry*0.6,rx,ry*0.5,(0,0,0),45); ell(x,y,rx,ry,pc('stone',night)); ell(x+rx*0.2,y+ry*0.35,rx*0.8,ry*0.6,pc('stoneDark',night))
    arch = [(860+t*260, 498-36*math.sin(math.pi*t)) for t in [i/24 for i in range(25)]]
    poly(arch+[(1120,520),(860,522)][::-1][::-1], pc('woodDark',night))
    line(arch, pc('wood',night), 14)
    for i in range(0,25,2): x,y = arch[i]; line([(x,y-6),(x,y+6)], pc('woodDark',night),2)
    rail = [(x,y-40) for x,y in arch]; line(rail, pc('wood',night), 5); line([(x,y-22) for x,y in arch], pc('wood',night), 3)
    for i in range(0,25,4): x,y = arch[i]; line([(x,y),(x,y-44)], pc('woodDark',night), 7)
    ell(990,530,120,8,(0,0,0),40)
    flush()
    # cây cổ thụ: rễ, thân, cành
    poly([(40,500),(110,430),(170,380),(190,250),(205,120),(240,40),(330,40),(320,130),(330,250),(360,380),(430,440),(470,505),(380,480),(320,440),(250,470),(180,445),(120,480)], pc('trunk',night))
    poly([(210,120),(242,48),(262,48),(238,140),(226,260),(206,372),(194,250)], pc('trunkDark',night),170)
    poly([(296,70),(318,48),(318,130),(332,240),(312,250)], pc('trunkLight',night),130)
    line([(300,110),(420,80),(560,70),(700,95),(820,130),(900,148)], pc('trunk',night), 34)
    line([(560,72),(640,30),(700,0)], pc('trunk',night), 20); line([(720,100),(780,60),(850,40)], pc('trunk',night), 14)
    line([(240,60),(140,40),(60,20)], pc('trunk',night), 26); line([(270,50),(300,0)], pc('trunk',night), 30)
    for pts in [[(230,200),(250,320)],[(290,180),(300,300)],[(260,90),(270,170)]]: line(pts, pc('trunkDark',night), 3, 160)
    for x,y,rx,ry in [(250,330,40,24),(150,440,50,18),(380,430,40,16)]: ell(x,y,rx,ry,pc('moss',night),200)
    flush()
    # tán lá: 3 tông, nhiều elip
    blobs = [(60,20,110,60),(200,0,120,50),(420,10,140,55),(600,40,120,60),(660,150,90,50),(560,150,60,40),(760,40,110,55),(900,90,120,60),(1020,60,100,50),(1080,130,70,40),(940,165,70,30)]
    for cx,cy,rx,ry in blobs: ell(cx,cy+12,rx,ry,pc('canopyDark',night))
    for cx,cy,rx,ry in blobs: ell(cx-8,cy,rx*0.85,ry*0.8,pc('canopy',night))
    for cx,cy,rx,ry in blobs: ell(cx-22,cy-14,rx*0.45,ry*0.4,pc('canopyLight',night))
    flush()
    if not night:  # tia nắng
        for x0 in (760, 860, 960):
            poly([(x0,150),(x0+30,150),(x0-140,520),(x0-200,520)], (255,252,220), 35)
    flush()
    # nhà nấm
    poly([(318,452),(322,360),(340,330),(520,330),(540,360),(546,452)], pc('stem',night))
    poly([(500,330),(520,330),(540,360),(546,452),(500,452)], pc('stemShade',night),200)
    ell(372,382,30,30,pc('woodDark',night)); ell(372,382,24,24,pc('window',night))
    line([(372,358),(372,406)],pc('woodDark',night),4); line([(348,382),(396,382)],pc('woodDark',night),4)
    poly([(465,455),(465,395),(495,365),(525,395),(525,455)], pc('door',night)); ell(495,395,30,30,pc('door',night))
    ell(476,418,4,4,pc('woodDark',night))
    poly([(478,455),(588,455),(596,472),(470,472)], pc('stone',night)); poly([(470,472),(600,472),(608,490),(462,490)], pc('stoneDark',night))
    poly([(480,250),(514,250),(514,205),(480,205)], pc('brick',night))
    # mũ nấm: vòm elip + gờ dưới
    flush()
    cap = Image.new('RGBA', base.size); cd = ImageDraw.Draw(cap)
    cd.ellipse([(430-158)*S,(322-112)*S,(430+158)*S,(322+112)*S], fill=pc('cap',night)+(255,))
    cd.rectangle([0,322*S,W*S,H*S], fill=(0,0,0,0)); base.alpha_composite(cap)
    ell(430,326,156,22,pc('capDark',night)); ell(430,322,154,14,pc('cap',night))
    for x,y,r in [(300,300,14),(352,250,22),(410,228,12),(520,262,18),(560,300,12),(395,300,10),(468,312,9)]: ell(x,y,r,r*0.85,pc('spot',night))
    ell(447,282,26,26,pc('woodDark',night)); ell(447,282,20,20,pc('window',night))
    line([(447,262),(447,302)],pc('woodDark',night),3); line([(427,282),(467,282)],pc('woodDark',night),3)
    line([(548,370),(548,392)],pc('woodDark',night),3); ell(552,398,8,11,(250,210,120) if night else (210,170,90))
    flush()
    if night:
        for cx,cy,r in [(372,382,24),(447,282,20),(552,398,10)]: glow(cx,cy,r,(255,200,100),4,120)
    # hàng rào
    for x0,x1,y0,y1 in [(290,455,418,428),(556,636,425,440)]:
        line([(x0,y0+8),(x1,y1+8)],pc('wood',night),6); line([(x0,y0+26),(x1,y1+26)],pc('wood',night),6)
        n = int((x1-x0)/36)+1
        for i in range(n):
            x = x0+i*(x1-x0)/max(n-1,1); y = y0+(y1-y0)*i/max(n-1,1)
            poly([(x-7,y+50),(x-7,y),(x,y-8),(x+7,y),(x+7,y+50)], pc('wood',night)); poly([(x+3,y+50),(x+3,y-3),(x+7,y),(x+7,y+50)], pc('woodDark',night))
    flush()
    # lối đi đất uốn từ bậc thềm xuống tiền cảnh
    L1 = [(500,490),(560,520),(520,560),(470,600),(500,650),(560,720)]
    R1 = [(590,490),(640,520),(600,560),(560,600),(640,650),(760,720)]
    poly(L1+R1[::-1], pc('path',night))
    for x,y,rx,ry in [(560,535,14,5),(520,580,16,6),(545,620,18,6),(600,670,30,9),(660,700,24,7)]: ell(x,y,rx,ry,pc('pathDark',night))
    flush()
    # nấm lớn, đá tiền cảnh, hoa, thỏ, bướm
    for cx,cy,rx,ry,sh in [(125,408,56,30,48),(172,456,28,16,24),(60,572,96,48,90)]:
        poly([(cx-rx*0.22,cy+sh),(cx-rx*0.18,cy),(cx+rx*0.18,cy),(cx+rx*0.22,cy+sh)], pc('stem',night))
        c2 = Image.new('RGBA', base.size); c2d = ImageDraw.Draw(c2)
        c2d.ellipse([(cx-rx)*S,(cy-ry*1.6)*S,(cx+rx)*S,(cy+ry*0.4)*S], fill=pc('cap',night)+(255,)); base.alpha_composite(c2)
        ell(cx,cy+ry*0.25,rx*0.95,ry*0.22,pc('capDark',night))
        for dx,dy,r in [(-0.5,-0.7,0.14),(0.1,-1.1,0.12),(0.5,-0.6,0.16),(-0.1,-0.4,0.09)]: ell(cx+dx*rx,cy+dy*ry,r*rx,r*rx*0.8,pc('spot',night))
        if night: glow(cx,cy-ry*0.5,rx*0.5,(255,170,120),3,50)
    for x,y,rx,ry in [(300,665,85,40),(432,660,56,24),(495,628,34,13),(752,692,42,15)]:
        ell(x,y+ry*0.5,rx,ry*0.5,(0,0,0),40); ell(x,y,rx,ry,pc('stone',night)); ell(x+rx*0.15,y+ry*0.3,rx*0.85,ry*0.6,pc('stoneDark',night))
    for x,y in [(172,578),(212,576),(262,576),(198,600),(240,600),(270,602),(832,650),(866,672),(820,672)]:
        for k in range(5):
            a = k*2*math.pi/5; ell(x+7*math.cos(a), y+7*math.sin(a), 5,5, pc('flowerW',night))
        ell(x,y,4,4,pc('flowerY',night))
    # thỏ
    ell(346,585,28,26,pc('rabbit',night)); ell(362,548,18,16,pc('rabbit',night))
    ell(352,522,6,18,pc('rabbit',night)); ell(366,520,6,18,pc('rabbit',night)); ell(322,592,8,8,pc('rabbit',night))
    ell(368,546,3,3,(40,30,30))
    if not night:
        for bx,by in [(188,545),(244,534)]:
            for dx in (-1,1): ell(bx+dx*7,by-3,7,6,(250,214,120)); ell(bx+dx*6,by+5,5,4,(250,214,120))
            line([(bx,by-7),(bx,by+7)],(120,80,40),2)
        for bx,by in [(1065,215),(1137,190)]: line([(bx-10,by+2),(bx,by-4),(bx+10,by+2)],(90,80,70),2)
    flush()
    # lá to tiền cảnh khung góc phải + dương xỉ trái
    for cx,cy,rx,ry,ang in [(1240,600,90,26,-40),(1150,650,100,24,-20),(1230,690,110,28,10),(1060,700,90,22,-10),(960,690,70,20,-30)]:
        g = Image.new('RGBA',(int(rx*2*S)+4,int(ry*2*S)+4)); gd = ImageDraw.Draw(g)
        gd.ellipse([0,0,rx*2*S,ry*2*S], fill=pc('leafFg',night)+(255,)); g = g.rotate(ang, expand=True)
        base.alpha_composite(g, (int(cx*S-g.width/2), int(cy*S-g.height/2)))
    for i in range(7):
        x = 10+i*9; line([(x,720),(x+30,560-i*20)], pc('leafFg2',night), 4)
    # cỏ dải đáy
    for x in range(0,W,5):
        h = rnd.randint(10,34); line([(x,722),(x+rnd.randint(-5,5),722-h)], pc('leafFg2',night) if rnd.random()<.6 else pc('groundDark',night), 2.5)
    flush()
    if night:  # đom đóm quanh tán cây và nhà
        for _ in range(16):
            x = rnd.choice([rnd.randint(100,620), rnd.randint(620,1100)]); y = rnd.randint(120,560)
            glow(x,y,3,(230,255,140),3,140); ell(x,y,2.5,2.5,(250,255,200))
        flush()
    out = base.resize((W,H), Image.LANCZOS).convert('RGB')
    if labels:
        dd = ImageDraw.Draw(out); f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",15)
        for s,x,y in [("Cây cổ thụ: gốc ~(250,460), cành lớn vươn tới (900,150)",120,170),("Nhà nấm: mũ tâm (430,322) rx158",300,195),
                      ("Hàng rào 2 đoạn",300,470),("Lối đi: bậc thềm (545,490) → tiền cảnh",560,560),("Hồ: tâm (1010,590) rx300 ry66",850,620),
                      ("Cầu: (860,520)→(1120,520), đỉnh vòm y≈462",880,410),("Mặt trời (1188,85) r34 · trăng đêm (1188,150)",880,40),
                      ("Núi xa",1110,330),("Thỏ",330,610),("Nấm lớn",30,640),("Đá",270,700)]:
            dd.text((x,y),s,font=f,fill=(255,255,255),stroke_width=3,stroke_fill=(0,0,0))
    return out

if __name__ == '__main__':
    render(False).save('layout_day.png'); render(True).save('layout_night.png'); render(False, True).save('layout_labeled.png')
