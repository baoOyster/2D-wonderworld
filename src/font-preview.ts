/**
 * Trang preview font (#7): render các câu tiếng Việt bằng `drawText` lên
 * framebuffer rồi `putImageData` lên canvas. Không dùng API Canvas để vẽ chữ.
 */
import { Framebuffer } from './core/framebuffer.ts';
import { drawText } from './core/font.ts';
import { CELL_H } from './core/font-data.ts';

const W = 1280;
const H = 940;
const BG = 0x0b1016ff;
const INK = 0xf3ead9ff;
const DIM = 0x8fa8bdff;
const GOLD = 0xffd060ff;
const ROSE = 0xff8fa3ff;

const canvas = document.querySelector<HTMLCanvasElement>('#font-preview')!;
canvas.width = W;
canvas.height = H;
const ctx = canvas.getContext('2d')!;

const fb = new Framebuffer(W, H);
fb.clear(BG);

let y = 24;

function line(text: string, scale: number, color: number, gap = 8): void {
  drawText(fb, text, 40, y, color, { scale });
  y += CELL_H * scale + gap;
}

line('Font tiếng Việt — #7', 3, GOLD, 20);
line('Thế giới cổ tích · Đường đá · Đom đóm · Mặt trời · Bầu trời', 2, INK);
line('Nhấn vào vật thể để xem thông tin · Chuyển ngày/đêm · Thu phóng', 2, DIM, 20);

line('Chữ hoa đủ dấu', 2, GOLD, 6);
line('Ế Ậ Ổ Ộ Ả Ạ Ề Ệ Ố Ợ Ứ Ự Ắ Ặ Ầ Ẩ Ẫ', 2, INK);

line('Dấu thanh', 2, GOLD, 6);
line('sắc: á é í ó ú ý   huyền: à è ì ò ù ỳ', 2, INK);
line('hỏi: ả ẻ ỉ ỏ ủ ỷ   ngã: ã ẽ ĩ õ ũ ỹ', 2, INK);
line('nặng: ạ ẹ ị ọ ụ ỵ', 2, INK, 20);

line('Dấu phụ + thanh', 2, GOLD, 6);
line('ă â ê ô ơ ư   ắ ấ ế ố ớ ứ   ặ ậ ệ ộ ợ ự', 2, INK);
line('i không chấm khi có dấu: í ì ỉ ĩ ị', 2, ROSE, 20);

line('Scale', 2, GOLD, 6);
line('Thế giới cổ tích', 1, DIM, 6);
line('Thế giới cổ tích', 2, INK, 6);
line('Thế giới', 3, GOLD, 0);

ctx.putImageData(fb.image, 0, 0);
