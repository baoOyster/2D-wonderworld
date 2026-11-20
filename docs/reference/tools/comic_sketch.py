"""Phác cảnh 'Thế giới cổ tích' phong cách truyện tranh.
Nguyên tắc (đều làm được bằng thuật toán của môn):
 1) Gộp hình thành một khối (mask = hợp các elip/đa giác) rồi mới tô  -> scanline fill trên vùng hợp
 2) Tô 2-3 tông theo một hướng sáng (sáng phía trên-phải, tối phía dưới-trái) -> giao/hiệu mask + fill
 3) Viền đậm quanh khối                                                 -> stroke polygon / biên vùng
 4) Chi tiết được cắt trong khối cha (đốm nấm nằm trong mũ)              -> clipping
Toạ độ thế giới 1280x720 (docs/reference/layout.md)."""
import math, random
from PIL import Image, ImageDraw, ImageFilter, ImageChops, ImageFont
W, H, S = 1280, 720, 2
WS, HS = W*S, H*S

PAL = {
 'day': dict(skyTop=(86,160,226), skyBot=(214,236,238), cloud=(255,255,255), cloudSh=(206,224,240),
   mFar=(170,198,228), mFarSh=(140,172,210), forestFar=(118,170,152), forestMid=(84,146,112), forestMidSh=(64,122,94), hill=(140,196,104),
   ground=(132,190,92), groundSh=(98,160,74), path=(236,204,148), pathSh=(212,172,118), stone=(196,190,182), stoneSh=(150,144,140), stoneHi=(226,222,214),
   trunk=(136,88,52), trunkSh=(96,60,38), trunkHi=(176,124,78), moss=(116,160,76),
   leafSh=(46,110,62), leaf=(88,160,74), leafHi=(156,206,96),
   cap=(214,66,58), capSh=(168,44,46), capHi=(238,108,92), spot=(252,240,218), stem=(248,236,214), stemSh=(220,198,172),
   door=(170,112,62), doorSh=(130,82,44), glass=(216,226,214), brick=(184,108,78), brickSh=(140,80,58),
   wood=(184,128,76), woodSh=(132,88,50), water=(126,196,214), waterDeep=(76,148,186), waterHi=(236,250,252), shore=(104,150,82),
   fgLeaf=(40,100,62), fgLeafSh=(26,76,48), flower=(255,252,244), flowerC=(250,206,64), rabbit=(250,246,240), rabbitSh=(214,206,206),
   ink=(52,38,34), inkSoft=(80,64,58)),
 'night': dict(skyTop=(8,16,48), skyBot=(46,56,110), cloud=(70,80,124), cloudSh=(52,60,100),
   mFar=(42,56,102), mFarSh=(32,44,84), forestFar=(24,44,66), forestMid=(18,36,50), forestMidSh=(12,26,38), hill=(26,52,50),
   ground=(32,58,52), groundSh=(22,44,42), path=(114,108,130), pathSh=(88,84,108), stone=(92,98,122), stoneSh=(64,70,94), stoneHi=(122,128,152),
   trunk=(62,46,46), trunkSh=(40,30,34), trunkHi=(88,68,64), moss=(40,64,52),
   leafSh=(12,34,36), leaf=(24,58,48), leafHi=(44,86,64),
   cap=(118,42,54), capSh=(80,26,38), capHi=(146,62,70), spot=(184,172,164), stem=(140,130,128), stemSh=(108,98,102),
   door=(86,58,44), doorSh=(60,40,34), glass=(255,208,112), brick=(88,56,52), brickSh=(64,40,40),
   wood=(92,66,54), woodSh=(62,44,40), water=(28,62,98), waterDeep=(14,34,66), waterHi=(150,172,206), shore=(26,46,42),
   fgLeaf=(10,30,32), fgLeafSh=(6,20,24), flower=(156,156,178), flowerC=(150,130,80), rabbit=(156,154,168), rabbitSh=(118,116,134),
   ink=(10,10,22), inkSoft=(20,20,36)),
}

class Canvas:
    def __init__(s, pal):
        s.p = pal; s.img = Image.new('RGBA', (WS, HS), (0,0,0,255))
    # ----- mask (vùng) -----
    def mask(s): return Image.new('L', (WS, HS), 0)
    def ell(s, m, cx, cy, rx, ry, v=255): ImageDraw.Draw(m).ellipse([(cx-rx)*S,(cy-ry)*S,(cx+rx)*S,(cy+ry)*S], fill=v); return m
    def poly(s, m, pts, v=255): ImageDraw.Draw(m).polygon([(x*S,y*S) for x,y in pts], fill=v); return m
    def rect(s, m, x0,y0,x1,y1, v=255): ImageDraw.Draw(m).rectangle([x0*S,y0*S,x1*S,y1*S], fill=v); return m
    def shift(s, m, dx, dy):
        ox, oy = int(dx*S), int(dy*S); w, h = m.size
        out = Image.new('L', m.size, 0); out.paste(m, (ox, oy))
        if oy > 0: out.paste(m.crop((0,0,w,1)).resize((w,oy)), (ox,0))          # kéo dài mép trên
        if oy < 0: out.paste(m.crop((0,h-1,w,h)).resize((w,-oy)), (ox,h+oy))     # kéo dài mép dưới
        if ox > 0: out.paste(out.crop((ox,0,ox+1,h)).resize((ox,h)), (0,0))
        if ox < 0: out.paste(out.crop((w+ox-1,0,w+ox,h)).resize((-ox,h)), (w+ox,0))
        return out
    def AND(s, a, b): return ImageChops.multiply(a, b)
    def SUB(s, a, b): return ImageChops.subtract(a, b)
    def OR(s, a, b): return ImageChops.lighter(a, b)
    # ----- tô -----
    def fill(s, m, col, a=255):
        if a < 255: m = m.point(lambda v: v*a//255)
        s.img.paste(Image.new('RGBA', s.img.size, col+(255,)), (0,0), m)
    def vgrad(s, m, c0, c1, y0, y1):
        g = Image.new('RGBA', (1, HS))
        for y in range(HS):
            t = min(max((y/S - y0)/(y1-y0), 0), 1); g.putpixel((0,y), tuple(int(c0[i]+(c1[i]-c0[i])*t) for i in range(3))+(255,))
        s.img.paste(g.resize(s.img.size), (0,0), m)
    def outline(s, m, col, w=2.0):
        k = int(w*S)*2+1; d = m.filter(ImageFilter.MaxFilter(k)); s.fill(ImageChops.subtract(d, m), col)
    def shaded(s, m, base, sh, hi=None, light=(6,-6), shade=0.55):
        """tô 3 tông: base; phần bị khối dịch về phía nguồn sáng che -> sh; phần sáng -> hi"""
        s.fill(m, base)
        lit = s.AND(m, s.shift(m, -light[0]*3, -light[1]*3))
        s.fill(s.SUB(m, s.shift(m, light[0]*shade*10, light[1]*shade*10)), sh)
        if hi: s.fill(s.SUB(m, s.shift(m, -light[0]*1.6, -light[1]*1.6)), hi)
    def line(s, pts, col, w, a=255):
        L = Image.new('RGBA', s.img.size); ImageDraw.Draw(L).line([(x*S,y*S) for x,y in pts], fill=col+(a,), width=max(1,int(w*S)), joint='curve'); s.img.alpha_composite(L)
    def glow(s, cx, cy, r, col, n=4, amax=120):
        for i in range(n, 0, -1):
            rr = r*(1+i*0.6); m = s.ell(s.mask(), cx, cy, rr, rr); s.fill(m, col, int(amax/(i+1)))

def taper(p0, p1, w0, w1, n=10, bend=0.0):
    """dải thuôn từ p0 (rộng w0) tới p1 (rộng w1), cong nhẹ -> đa giác"""
    (x0,y0),(x1,y1) = p0,p1; dx,dy = x1-x0,y1-y0; L = math.hypot(dx,dy); nx,ny = -dy/L, dx/L
    left, right = [], []
    for i in range(n+1):
        t = i/n; b = bend*math.sin(math.pi*t); cx,cy = x0+dx*t+nx*b, y0+dy*t+ny*b; w = (w0+(w1-w0)*t)/2
        left.append((cx+nx*w, cy+ny*w)); right.append((cx-nx*w, cy-ny*w))
    return left+right[::-1]

def puff(c, m, cx, cy, r, k=7, seed=0):
    """cụm lá kiểu súp lơ: hợp k hình tròn quanh tâm"""
    rnd = random.Random(seed); c.ell(m, cx, cy+r*0.15, r*0.9, r*0.75)
    for i in range(k):
        a = math.pi*(1.05 + 0.9*i/(k-1)) ; rr = r*rnd.uniform(0.42,0.55)
        c.ell(m, cx+math.cos(a)*r*0.72, cy+math.sin(a)*r*0.55, rr, rr)
    for dx in (-0.55, 0, 0.55): c.ell(m, cx+dx*r, cy+r*0.35, r*0.5, r*0.35)
    return m

def render(mode='day', labels=False):
    P = PAL[mode]; night = mode == 'night'; c = Canvas(P); rnd = random.Random(11)
    full = c.rect(c.mask(), 0,0,W,H)
    # 1 trời
    c.vgrad(full, P['skyTop'], P['skyBot'], 0, 470)
    if night:
        for _ in range(130):
            x,y = rnd.uniform(0,W), rnd.uniform(0,430); r = rnd.choice([0.8,0.8,1.2,1.8])
            c.fill(c.ell(c.mask(),x,y,r,r), (255,250,225), rnd.randint(140,255))
        c.glow(1188,150,30,(200,210,255),4,80)
        m = c.ell(c.mask(),1188,150,30,30); c.fill(m,(250,244,214))
        c.outline(m,(150,140,112),1.4)
        for x,y,r in [(1178,140,6),(1198,160,5),(1194,138,3)]: c.fill(c.AND(c.ell(c.mask(),x,y,r,r),m),(222,214,186))
    else:
        c.glow(1188,85,34,(255,236,160),5,110); sm_=c.ell(c.mask(),1188,85,34,34); c.fill(sm_,(255,248,212)); c.outline(sm_,(226,164,70),1.6)
    # 2 mây: khối gộp, đáy phẳng, bóng dưới, viền mảnh sáng
    for cx,cy,s_ in [(1010,286,1.0),(1236,226,0.85),(752,244,0.7),(470,236,0.55)]:
        m = c.mask()
        for dx,dy,r in [(-48,4,30),(-16,-14,38),(24,-8,34),(54,6,26)]: c.ell(m,cx+dx*s_,cy+dy*s_,r*s_,r*s_)
        c.rect(m, cx-70*s_, cy, cx+76*s_, cy+18*s_); m = c.SUB(m, c.rect(c.mask(), 0, cy+18*s_, W, H))
        c.fill(m, P['cloud'], 235); c.fill(c.SUB(m, c.shift(m,0,-7*s_)), P['cloudSh'], 235)
    # 3 núi xa (không viền, phối cảnh khí quyển)
    m = c.poly(c.mask(), [(900,432),(980,370),(1050,330),(1110,300),(1188,280),(1240,300),(1280,312),(1280,432)])
    c.fill(m, P['mFar']); c.fill(c.AND(m, c.poly(c.mask(), [(1188,280),(1150,432),(900,432),(900,300)])), P['mFarSh'])
    # 4 rừng nền: silhouette gộp
    m = c.mask()
    for i in range(32):
        x = 540+i*23+rnd.uniform(-6,6); h = rnd.uniform(70,120); w = h*0.32
        for k in range(3): c.poly(m, [(x-w*(1-k*0.25),448-h*k*0.28),(x,448-h-h*k*0.0),(x+w*(1-k*0.25),448-h*k*0.28)])
    for i in range(9):
        x = 6+i*27; h = rnd.uniform(230,330); w = 30
        for k in range(4): c.poly(m, [(x-w*(1-k*0.2),470-h*k*0.22),(x,470-h),(x+w*(1-k*0.2),470-h*k*0.22)])
    c.fill(m, P['forestFar'])
    m2 = c.mask()
    for x,y,r in [(612,420,40),(690,428,44),(830,414,46),(912,420,40),(1046,424,48),(1128,416,42),(1236,410,50)]: puff(c,m2,x,y,r,6,int(x))
    c.shaded(m2, P['forestMid'], P['forestMidSh'], None, light=(5,-5))
    c.outline(m2, P['forestMidSh'], 1.2)
    m = c.poly(c.mask(), [(1140,482),(1170,428),(1220,398),(1280,388),(1280,482)]); c.fill(m, P['hill'])
    # 5 mặt đất
    g = c.poly(c.mask(), [(0,470),(160,452),(420,468),(700,456),(900,470),(1280,462),(1280,720),(0,720)])
    c.vgrad(g, P['ground'], P['groundSh'], 470, 720); c.line([(0,470),(160,452),(420,468),(700,456),(900,470),(1280,462)], P['groundSh'], 2)
    # 6 hồ: bờ, nước nông, nước sâu, sóng, phản chiếu
    shore = c.ell(c.mask(),1010,588,306,72); c.fill(shore, P['shore'])
    water = c.ell(c.mask(),1010,592,298,64); c.vgrad(water, P['water'], P['waterDeep'], 530, 660)
    deep = c.AND(c.ell(c.mask(),1030,606,230,42), water); c.fill(deep, P['waterDeep'], 140)
    for i in range(11):
        y = 560+i*8; x = 820+rnd.uniform(0,340); c.line([(x,y),(x+rnd.uniform(18,46),y)], P['waterHi'], 1.6, 190)
    if night:
        for k in range(6): c.fill(c.AND(c.ell(c.mask(),1188,556+k*13,24-k*3,3),water),(240,236,200),200-k*25)
    else:
        for k in range(4): c.fill(c.AND(c.ell(c.mask(),1188,560+k*12,20-k*4,2.5),water),(255,250,220),170-k*30)
    c.outline(water, P['ink'], 1.6)
    # 7 cầu vòm
    arch = [(860+t*260, 500-38*math.sin(math.pi*t)) for t in [i/30 for i in range(31)]]
    deck = c.poly(c.mask(), [(x,y-5) for x,y in arch]+[(x,y+12) for x,y in arch][::-1])
    rails = c.mask(); 
    for i in range(0,31,5):
        x,y = arch[i]; c.poly(rails, [(x-4,y-5),(x-4,y-42),(x+4,y-46),(x+4,y-5)])
    rl = c.poly(c.mask(), [(x,y-40) for x,y in arch]+[(x,y-35) for x,y in arch][::-1]); rl2 = c.poly(c.mask(), [(x,y-22) for x,y in arch]+[(x,y-18) for x,y in arch][::-1])
    rails = c.OR(c.OR(rails, rl), rl2)
    c.fill(rails, P['wood']); c.outline(rails, P['ink'], 1.4)
    c.fill(deck, P['wood']); c.fill(c.SUB(deck, c.shift(deck,0,-6)), P['woodSh'])
    for i in range(0,31,2):
        x,y = arch[i]; c.line([(x,y-5),(x,y+12)], P['woodSh'], 1.2)
    c.outline(deck, P['ink'], 1.6)
    for x in (866,1114): m = c.poly(c.mask(), [(x-8,512),(x+8,512),(x+10,530),(x-10,530)]); c.fill(m,P['woodSh']); c.outline(m,P['ink'],1.4)
    # 8 đá ven hồ
    def rock(x,y,rx,ry):
        m = c.poly(c.mask(), [(x-rx,y+ry*0.6),(x-rx*0.85,y-ry*0.2),(x-rx*0.4,y-ry*0.9),(x+rx*0.3,y-ry),(x+rx*0.9,y-ry*0.3),(x+rx,y+ry*0.6)])
        c.fill(c.ell(c.mask(),x,y+ry*0.6,rx*1.05,ry*0.3),(0,0,0),50)
        c.shaded(m, P['stone'], P['stoneSh'], P['stoneHi'], light=(5,-5)); c.outline(m, P['ink'], 1.5)
    for x,y,rx,ry in [(735,538,40,20),(826,524,30,15),(1186,504,46,22),(1136,524,22,11)]: rock(x,y,rx,ry)
    # 9 cây cổ thụ
    trunk = c.mask()
    c.poly(trunk, [(170,470),(186,380),(196,260),(206,150),(232,60),(262,-10),(336,-10),(326,70),(322,160),(330,270),(350,380),(372,470)])
    for p0,p1,w0,w1,b in [((210,440),(40,505),46,6,10),((250,450),(150,512),40,6,-6),((330,440),(470,505),46,6,-10),((350,420),(430,470),30,4,-4),((300,460),(330,512),36,6,0)]:
        c.poly(trunk, taper(p0,p1,w0,w1,10,b))
    branch = c.mask()
    for p0,p1,w0,w1,b in [((300,110),(560,72),46,30,-14),((556,72),(900,150),30,10,-22),((560,74),(680,-10),22,8,6),((740,100),(850,40),14,4,6),((250,70),(60,30),34,8,10),((280,40),(300,-20),30,20,0)]:
        c.poly(branch, taper(p0,p1,w0,w1,12,b))
    wood_ = c.OR(trunk, branch)
    c.fill(wood_, P['trunk'])
    c.fill(c.AND(wood_, c.poly(c.mask(), [(0,0),(240,0),(214,480),(0,520)])), P['trunkSh'])
    c.fill(c.SUB(c.AND(wood_, c.poly(c.mask(),[(296,0),(340,0),(350,470),(318,470)])), c.mask()), P['trunkHi'])
    for pts in [[(232,180),(244,300),(236,400)],[(286,120),(296,240),(290,330)],[(262,60),(270,150)],[(318,260),(330,360)]]: c.line(pts, P['trunkSh'], 1.6)
    hollow = c.ell(c.mask(),252,330,16,30); c.fill(hollow, (255,196,96) if night else (58,36,24)); c.outline(hollow, P['ink'], 1.4)
    if night: c.glow(252,330,18,(255,190,90),3,110)
    mossm = c.AND(c.OR(c.ell(c.mask(),236,356,30,14), c.ell(c.mask(),360,452,36,12)), wood_); c.fill(mossm, P['moss'])
    c.outline(wood_, P['ink'], 2.2)
    # tán: các cụm súp lơ, vẽ từ sau ra trước
    clusters = [(40,10,78),(170,-10,84),(330,0,92),(470,30,86),(610,40,82),(560,140,58),(690,150,62),(760,40,80),(880,80,84),(1000,60,76),(1080,130,54),(940,170,52)]
    for i,(x,y,r) in enumerate(clusters):
        m = puff(c, c.mask(), x, y, r, 7, i)
        c.shaded(m, P['leaf'], P['leafSh'], P['leafHi'], light=(6,-6)); c.outline(m, P['ink'], 2.0)
    if night:
        for _ in range(16):
            x = rnd.choice([rnd.uniform(60,640), rnd.uniform(640,1100)]); y = rnd.uniform(130,560)
            c.glow(x,y,2.5,(220,255,140),3,150); fm_=c.ell(c.mask(),x,y,2.2,2.2); c.fill(fm_,(250,255,200)); c.outline(fm_,(120,150,60),0.7)
    # 10 nhà nấm
    chim = c.rect(c.mask(), 480,200,514,252); c.fill(chim,P['brick']); c.fill(c.rect(c.mask(),500,200,514,252),P['brickSh'])
    for y in (212,226,240): c.line([(480,y),(514,y)],P['brickSh'],1)
    c.fill(c.rect(c.mask(),476,196,518,206),P['brickSh']); c.outline(c.OR(chim,c.rect(c.mask(),476,196,518,206)),P['ink'],1.6)
    stem = c.poly(c.mask(), [(312,456),(318,400),(330,350),(342,330),(520,330),(534,350),(544,400),(552,456)])
    c.fill(stem, P['stem']); c.fill(c.AND(stem, c.rect(c.mask(),490,320,560,460)), P['stemSh'])
    win = c.ell(c.mask(),372,384,26,26); c.fill(win,P['woodSh']); g_ = c.ell(c.mask(),372,384,20,20); c.fill(g_,P['glass'])
    c.line([(372,364),(372,404)],P['woodSh'],3); c.line([(352,384),(392,384)],P['woodSh'],3); c.outline(win,P['ink'],1.6)
    door = c.OR(c.rect(c.mask(),466,394,526,456), c.ell(c.mask(),496,394,30,30)); c.fill(door,P['door'])
    for x in (481,496,511): c.line([(x,370),(x,456)],P['doorSh'],1.4)
    c.fill(c.ell(c.mask(),474,420,3.5,3.5),P['ink']); c.outline(door,P['ink'],1.8)
    c.outline(stem, P['ink'], 2.0)
    for y0,x0,x1 in [(456,462,608),(472,456,616)]:
        st = c.rect(c.mask(),x0,y0,x1,y0+16); c.shaded(st,P['stone'],P['stoneSh'],None,light=(0,-4)); c.outline(st,P['ink'],1.4)
    cap = c.SUB(c.ell(c.mask(),430,326,160,114), c.rect(c.mask(),0,326,W,H))
    cap = c.OR(cap, c.ell(c.mask(),430,326,160,16))
    c.fill(cap, P['cap']); c.fill(c.SUB(cap, c.shift(c.ell(c.mask(),430,326,160,114),14,22)), P['capSh'])
    c.fill(c.AND(c.ell(c.mask(),470,250,70,40), cap), P['capHi'])
    for x,y,r in [(296,300,14),(350,248,22),(412,224,12),(522,258,18),(566,300,13),(398,298,10),(470,310,9),(588,320,7)]:
        sp = c.AND(c.ell(c.mask(),x,y,r,r*0.82), cap); c.fill(sp, P['spot'])   # đốm cắt trong mũ
    rim = c.AND(c.ell(c.mask(),430,330,158,16), c.rect(c.mask(),0,326,W,H)); c.fill(rim, P['capSh'])
    cw = c.ell(c.mask(),447,284,22,22); c.fill(cw,P['woodSh']); c.fill(c.ell(c.mask(),447,284,16,16),P['glass'])
    c.line([(447,268),(447,300)],P['woodSh'],2.4); c.line([(431,284),(463,284)],P['woodSh'],2.4); c.outline(cw,P['ink'],1.4)
    c.outline(c.OR(cap,rim), P['ink'], 2.2)
    c.line([(548,370),(548,388)],P['ink'],1.6); lan = c.poly(c.mask(),[(542,388),(554,388),(558,404),(538,404)]); c.fill(lan,(255,214,120) if night else (230,190,110)); c.outline(lan,P['ink'],1.2)
    if night:
        for x,y,r in [(372,384,20),(447,284,16),(548,396,10)]: c.glow(x,y,r,(255,200,100),4,120)
    # 11 hàng rào
    for x0,x1,y0,y1 in [(290,455,420,430),(556,636,428,442)]:
        fm = c.mask(); n = int((x1-x0)/32)+1
        for i in range(n):
            x = x0+i*(x1-x0)/(n-1); y = y0+(y1-y0)*i/(n-1); c.poly(fm, [(x-6,y+52),(x-6,y),(x,y-9),(x+6,y),(x+6,y+52)])
        rails = c.OR(c.poly(c.mask(),[(x0,y0+10),(x1,y1+10),(x1,y1+16),(x0,y0+16)]), c.poly(c.mask(),[(x0,y0+28),(x1,y1+28),(x1,y1+34),(x0,y0+34)]))
        c.fill(rails,P['woodSh']); c.outline(rails,P['ink'],1.3)
        c.shaded(fm,P['wood'],P['woodSh'],None,light=(-4,0)); c.outline(fm,P['ink'],1.5)
    # 12 lối đi
    L1 = [(500,490),(548,516),(524,552),(476,592),(490,640),(540,690),(560,720)]
    R1 = [(596,490),(640,516),(612,552),(566,592),(600,640),(690,690),(770,720)]
    pm = c.poly(c.mask(), L1+R1[::-1]); c.fill(pm, P['path']); c.fill(c.SUB(pm, c.shift(pm,8,0)), P['pathSh'])
    for x,y,rx,ry in [(560,532,14,5),(520,574,17,6),(540,616,20,7),(590,664,28,8),(660,704,24,7)]:
        sm = c.ell(c.mask(),x,y,rx,ry); c.fill(sm,P['stone']); c.outline(sm,P['inkSoft'],1.0)
    c.line(L1, P['pathSh'], 2); c.line(R1, P['pathSh'], 2)
    # 13 nấm lớn
    def mushroom(cx,cy,rx,ry,sh):
        st = c.poly(c.mask(), [(cx-rx*0.24,cy+sh),(cx-rx*0.18,cy),(cx+rx*0.18,cy),(cx+rx*0.24,cy+sh)])
        c.fill(st,P['stem']); c.fill(c.AND(st,c.rect(c.mask(),cx+rx*0.05,cy,cx+rx,cy+sh)),P['stemSh']); c.outline(st,P['ink'],1.6)
        cp = c.SUB(c.ell(c.mask(),cx,cy+ry*0.15,rx,ry*1.25), c.rect(c.mask(),0,cy+ry*0.15,W,H)); cp = c.OR(cp, c.ell(c.mask(),cx,cy+ry*0.15,rx,ry*0.2))
        c.fill(cp,P['cap']); c.fill(c.SUB(cp,c.shift(cp,rx*0.1,ry*0.2)),P['capSh'])
        for dx,dy,r in [(-0.55,-0.4,0.14),(0.05,-0.85,0.12),(0.5,-0.35,0.16),(-0.12,-0.25,0.09),(0.75,0.0,0.08)]:
            c.fill(c.AND(c.ell(c.mask(),cx+dx*rx,cy+dy*ry,r*rx,r*rx*0.8),cp),P['spot'])
        c.outline(cp,P['ink'],1.8)
        if night: c.glow(cx,cy-ry*0.4,rx*0.45,(255,170,120),3,40)
    for a in [(125,404,56,30,52),(172,454,28,16,26),(62,568,98,50,100)]: mushroom(*a)
    # 14 đá tiền cảnh
    for x,y,rx,ry in [(300,662,84,38),(432,656,54,22),(495,626,32,12),(752,690,40,14)]: rock(x,y,rx,ry)
    # 15 hoa
    for x,y in [(172,578),(210,574),(258,576),(196,600),(238,602),(272,600),(832,650),(866,670),(818,672)]:
        fl = c.mask()
        for k in range(6): a = k*math.pi/3; c.ell(fl, x+7*math.cos(a), y+7*math.sin(a), 5, 5)
        c.line([(x,y+6),(x+1,y+22)],P['leafSh'],1.6); c.fill(fl,P['flower']); c.outline(fl,P['inkSoft'],0.9); c.fill(c.ell(c.mask(),x,y,4,4),P['flowerC'])
    # 16 thỏ
    rb = c.mask(); c.ell(rb,346,584,28,24); c.ell(rb,362,550,18,16); c.poly(rb, taper((354,540),(350,508),11,7,6,-2)); c.poly(rb, taper((366,540),(370,506),11,7,6,2)); c.ell(rb,320,594,9,8)
    c.shaded(rb,P['rabbit'],P['rabbitSh'],None,light=(4,-4)); c.outline(rb,P['ink'],1.6)
    for leg in (c.OR(c.ell(c.mask(),334,606,20,7), c.ell(c.mask(),326,598,10,10)),            # chân sau + đùi
                c.OR(c.poly(c.mask(), taper((356,588),(358,606),9,8,4,0)), c.ell(c.mask(),361,607,8,4)),   # chân trước trái
                c.OR(c.poly(c.mask(), taper((368,586),(371,605),8,7,4,0)), c.ell(c.mask(),374,606,7,3.5))): # chân trước phải
        c.fill(leg,P['rabbit']); c.fill(c.SUB(leg,c.shift(leg,-3,-3)),P['rabbitSh']); c.outline(leg,P['ink'],1.3)
    c.fill(c.ell(c.mask(),369,548,2.6,3),P['ink']); c.fill(c.ell(c.mask(),352,522,3,10),(240,170,170) if not night else (130,110,120))
    if not night:
        for bx,by,col in [(190,544,(250,214,110)),(246,532,(246,170,200))]:
            bm = c.mask()
            for dx in (-1,1): c.ell(bm,bx+dx*8,by-4,8,7); c.ell(bm,bx+dx*6,by+5,5.5,4.5)
            c.fill(bm,col); c.outline(bm,P['inkSoft'],0.9); c.line([(bx,by-8),(bx,by+8)],P['ink'],1.6)
        for bx,by in [(1065,215),(1137,190)]: c.line([(bx-11,by+3),(bx-4,by-3),(bx,by),(bx+4,by-3),(bx+11,by+3)],P['ink'],1.8)
    # 17 lá to tiền cảnh (lá nhọn + gân) & khóm cỏ
    def leafshape(cx,cy,L,Wd,ang):
        pts=[]; ca,sa = math.cos(math.radians(ang)), math.sin(math.radians(ang))
        for i in range(21):
            t=i/20; x=(t-0.5)*L; y=-math.sin(math.pi*t)*Wd/2*(1.0 if t<0.95 else 0.6); pts.append((x,y))
        for i in range(20,-1,-1):
            t=i/20; x=(t-0.5)*L; y=math.sin(math.pi*t)*Wd/2; pts.append((x,y))
        return [(cx+x*ca-y*sa, cy+x*sa+y*ca) for x,y in pts], [(cx-L/2*ca,cy-L/2*sa),(cx+L/2*ca,cy+L/2*sa)]
    for cx,cy,L,Wd,ang in [(1236,610,190,58,-55),(1150,668,200,54,-25),(1240,700,210,60,10),(1050,710,170,46,-15),(960,700,130,38,-35),(30,640,170,40,-80),(20,700,160,44,-60)]:
        pts, mid = leafshape(cx,cy,L,Wd,ang); m = c.poly(c.mask(), pts)
        c.fill(m,P['fgLeaf']); c.fill(c.AND(m,c.shift(m,0,Wd*0.25)),P['fgLeafSh']); c.line(mid,P['fgLeafSh'],1.6); c.outline(m,P['ink'],1.6)
    gm = c.mask()
    for x in range(0, W, 26):
        h = rnd.uniform(16,34)
        for k in (-1,0,1): c.poly(gm, [(x+k*7-4,722),(x+k*9+rnd.uniform(-3,3),722-h*(1-abs(k)*0.3)),(x+k*7+4,722)])
    c.fill(gm, P['groundSh']); c.fill(c.SUB(gm,c.shift(gm,0,6)), P['ground'])
    out = c.img.resize((W,H), Image.LANCZOS).convert('RGB')
    if labels:
        d = ImageDraw.Draw(out); f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",14)
        for s,x,y in [("1 Gộp khối rồi mới tô",600,215),("2 Tô 3 tông theo hướng sáng",250,140),("3 Viền đậm",420,175),("4 Đốm cắt trong mũ (clipping)",300,195)]:
            d.text((x,y),s,font=f,fill=(255,255,255),stroke_width=3,stroke_fill=(0,0,0))
    return out

if __name__ == '__main__':
    render('day').save('comic_day.png'); render('night').save('comic_night.png')
