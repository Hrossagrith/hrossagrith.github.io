"""Compose the six head-carriage drawings from the Blainville skeleton plate
(skull and cervical column) and the Ellenberger head plate (silhouette, eye,
nostril, ear, mouth). The skull is rigid; each cervical vertebra is a rigid
piece placed along the carriage's vertebral chain; the crest and the throat
line are drawn as offsets from that chain."""
import json
import math
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import lib

OUT = sys.argv[1] if len(sys.argv) > 1 else 'out'
HEAD_LEN = 560.0          # canvas px from the poll to the upper lip; 1 px = 1 mm
MARGIN = 12
INK = (24, 20, 16)

# ---- Blainville skeleton crop (plate origin 1230,0) --------------------------
SK = {
    'crest': (402, 40), 'joint': (405, 115), 'orbit': (540, 145), 'nasal_tip': (750, 212),
    'incisors': (752, 335), 'angle': (433, 328), 'bars': (700, 322), 'chin': (700, 352),
    'nose': (665, 232), 'tmj': (425, 150), 'jaw_mid': (560, 338),
}
# vertebral chain: joint, C1..C7, T1 (approximate centres)
SK_CHAIN = np.array([(405, 115), (350, 135), (262, 175), (225, 225), (180, 290), (140, 355),
                     (105, 420), (60, 470), (20, 500)], dtype=np.float64)
SK_HALF_WIDTH = 46
SK_DIVIDE = 398           # x: skull to the right, vertebrae to the left

# ---- Ellenberger head crop (plate origin 100,95) ------------------------------
HD = {
    'poll': (339, 190), 'eye': (456, 295), 'nasal_tip': (685, 503), 'incisors': (690, 612),
    'angle': (298, 478), 'poll_skin': (337, 182), 'lip': (715, 640), 'jaw_mid': (470, 632),
}
HD_CUT = [(292, 182), (280, 240), (262, 330), (260, 420), (266, 446), (284, 470), (300, 492), (305, 530), (310, 580)]
HD_CREST_J = (292, 182)
HD_THROAT_J = (300, 492)
HD_GHOST = [
    ('eye', 456, 295, 46, 40, 16, 0.9),
    ('nostril', 672, 537, 44, 40, 14, 0.9),
    ('mouth', 660, 630, 62, 34, 14, 0.8),
    ('ears', 325, 95, 62, 92, 14, 0.7),
]

# ---- carriages ----------------------------------------------------------------
POSES = {
    'not-collected': dict(face=152, chain=[34, 36, 38, 41, 44, 46, 44, 40],
                          crest=[1, 1, 1, 1, 1, 1, 1, 1, 1], under=[1, 1, 1, 1, 1, 1, 1, 1, 1]),
    'above': dict(face=138, chain=[10, 16, 30, 48, 62, 68, 64, 58],
                  crest=[1, 1, 0.92, 0.82, 0.78, 0.82, 0.9, 1, 1], under=[1, 1.08, 1.15, 1.18, 1.15, 1.08, 1, 1, 1]),
    'correct': dict(face=104, chain=[7, 18, 32, 44, 52, 56, 52, 46],
                    crest=[1, 1.05, 1.1, 1.12, 1.1, 1.05, 1, 1, 1], under=[1, 0.95, 0.9, 0.9, 0.92, 0.95, 1, 1, 1]),
    'vertical': dict(face=92, chain=[0, 14, 30, 44, 52, 56, 52, 46],
                     crest=[1, 1.06, 1.12, 1.12, 1.1, 1.05, 1, 1, 1], under=[1, 0.94, 0.9, 0.9, 0.92, 0.95, 1, 1, 1]),
    'btv': dict(face=72, chain=[-10, 4, 24, 42, 52, 57, 54, 48],
                crest=[1, 1.1, 1.15, 1.15, 1.1, 1.05, 1, 1, 1], under=[0.95, 0.9, 0.88, 0.9, 0.95, 1, 1, 1, 1]),
    'rollkur': dict(face=45, chain=[-32, -24, -6, 22, 46, 60, 65, 64],
                    crest=[1, 1.1, 1.18, 1.18, 1.12, 1.05, 1, 1, 1], under=[0.9, 0.85, 0.85, 0.9, 0.95, 1, 1, 1, 1]),
}
ORDER = ['not-collected', 'above', 'correct', 'vertical', 'btv', 'rollkur']
CREST = np.array([80, 85, 95, 115, 140, 175, 215, 245, 265], dtype=np.float64)
UNDER = np.array([230, 230, 225, 215, 200, 180, 160, 145, 145], dtype=np.float64)


# ---- small geometry helpers ------------------------------------------------------
def apply(M, pts):
    pts = np.asarray(pts, dtype=np.float64)
    P = np.hstack([pts, np.ones((len(pts), 1))])
    return (M @ P.T).T[:, :2]


def rot(deg):
    r = math.radians(deg)
    return np.array([[math.cos(r), -math.sin(r), 0], [math.sin(r), math.cos(r), 0], [0, 0, 1]])


def trans(dx, dy):
    return np.array([[1, 0, dx], [0, 1, dy], [0, 0, 1]], dtype=np.float64)


def scale(sx, sy):
    return np.array([[sx, 0, 0], [0, sy, 0], [0, 0, 1]], dtype=np.float64)


def feather_mask(shape, patches):
    out = np.zeros(shape, dtype=np.float32)
    for name, cx, cy, rx, ry, fe, strength in patches:
        img = Image.new('L', (shape[1], shape[0]), 0)
        ImageDraw.Draw(img).ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=255)
        img = img.filter(ImageFilter.GaussianBlur(fe))
        out = np.maximum(out, np.asarray(img, dtype=np.float32) / 255 * strength)
    return out


def band_mask(shape, polyline, width):
    img = Image.new('L', (shape[1], shape[0]), 0)
    ImageDraw.Draw(img).line([tuple(p) for p in polyline], fill=255, width=width, joint='curve')
    return np.asarray(img) > 127


def half_plane_mask(shape, polyline):
    """Pixels to the right of the polyline at their row."""
    h, w = shape
    xs = np.zeros(h, dtype=np.float64)
    pl = np.asarray(polyline, dtype=np.float64)
    for y in range(h):
        x_at = None
        for i in range(len(pl) - 1):
            (x0, y0), (x1, y1) = pl[i], pl[i + 1]
            if (y0 <= y <= y1) or (y1 <= y <= y0):
                t = 0 if y1 == y0 else (y - y0) / (y1 - y0)
                x_at = x0 + t * (x1 - x0)
                break
        if x_at is None:
            x_at = pl[0][0] if y < pl[0][1] else pl[-1][0]
        xs[y] = x_at
    cols = np.arange(w)[None, :]
    return cols >= xs[:, None]


def stroke(draw, pts, width, fade_from=None, alpha=235):
    pts = np.asarray(pts)
    n = len(pts)
    for i in range(n - 1):
        a = alpha
        if fade_from is not None and i >= fade_from:
            a = int(alpha * max(0.0, 1 - (i - fade_from) / max(1, n - 1 - fade_from)))
        draw.line([tuple(pts[i]), tuple(pts[i + 1])], fill=INK + (a,), width=width)


def chain_directions(chain):
    """Direction (deg) of the chain at each node: mean of adjacent segments."""
    d = np.gradient(np.asarray(chain, dtype=np.float64), axis=0)
    return np.degrees(np.arctan2(d[:, 1], d[:, 0]))


def vertebra_masks(shape, chain):
    """One soft mask per chain node: the strip between the perpendicular
    bisectors of the adjacent segments (node 0 = the joint, not used)."""
    h, w = shape
    ys, xs = np.mgrid[0:h, 0:w]
    P = np.stack([xs, ys], -1).astype(np.float64)
    masks = []
    n = len(chain)
    for i in range(n):
        m = np.ones((h, w), dtype=np.float64)
        if i > 0:
            mid = (chain[i] + chain[i - 1]) / 2
            d = chain[i] - chain[i - 1]
            d /= np.linalg.norm(d)
            s = (P - mid) @ d
            m *= np.clip(s / 3 + 0.5, 0, 1)
        if i < n - 1:
            mid = (chain[i] + chain[i + 1]) / 2
            d = chain[i + 1] - chain[i]
            d /= np.linalg.norm(d)
            s = (P - mid) @ d
            m *= np.clip(-s / 3 + 0.5, 0, 1)
        masks.append(m)
    return masks


def main():
    head_mask = np.load('head-mask.npy')
    head_ink = Image.open('head-ink.png')
    skel_ink = Image.open('skel-ink.png')
    sk_arr = np.asarray(skel_ink).astype(np.float32)
    sk_arr[..., 3] = np.clip(sk_arr[..., 3] * 1.3, 0, 255)
    xs_ = np.arange(sk_arr.shape[1])[None, :]
    skull_sel = (xs_ >= SK_DIVIDE).astype(np.float32)
    skull_a = sk_arr.copy(); skull_a[..., 3] *= skull_sel
    skull_ink = Image.fromarray(skull_a.astype(np.uint8), 'RGBA')
    chain_a = sk_arr.copy(); chain_a[..., 3] *= (1 - skull_sel)
    chain_ink = Image.fromarray(chain_a.astype(np.uint8), 'RGBA')

    # skull -> head plate similarity, from landmark pairs
    pairs = [('crest', 'poll'), ('orbit', 'eye'), ('angle', 'angle'), ('incisors', 'incisors'), ('nasal_tip', 'nasal_tip')]
    weights = np.array([1.0, 1.0, 1.0, 0.7, 0.5])
    # the skull may be scaled across the face line (its depth) before the similarity fit
    c0 = np.array(SK['crest'], dtype=np.float64)
    u = np.array(SK['incisors'], dtype=np.float64) - c0
    u /= np.linalg.norm(u)
    v = np.array([-u[1], u[0]])
    best = None
    for kv in np.linspace(0.80, 1.05, 26):
        Mpre = np.eye(3)
        B = np.stack([u, v], 1)            # columns: face axis, depth axis
        Mpre[:2, :2] = B @ np.diag([1.0, kv]) @ B.T
        Mpre[:2, 2] = c0 - Mpre[:2, :2] @ c0
        src_pts_ = apply(Mpre, [SK[a] for a, b in pairs])
        dst_pts_ = np.array([HD[b] for a, b in pairs], dtype=np.float64)
        # weighted similarity: repeat points by weight
        rep = np.round(weights * 10).astype(int)
        s_, R_, t_ = lib.similarity_fit(np.repeat(src_pts_, rep, axis=0), np.repeat(dst_pts_, rep, axis=0))
        Msim = np.eye(3); Msim[:2, :2] = s_ * R_; Msim[:2, 2] = t_
        M = Msim @ Mpre
        res = apply(M, [SK[a] for a, b in pairs]) - dst_pts_
        err = float((np.linalg.norm(res, axis=1) * weights).sum())
        if best is None or err < best[0]:
            best = (err, kv, M, s_, res)
    err, kv, M_sk2hd, s_, res = best
    print('skull->head: depth scale %.2f, size %.3f, residuals (px):' % (kv, s_), dict(zip([b for a, b in pairs], np.round(np.linalg.norm(res, axis=1), 1))))
    # registration overlay
    reg = Image.new('RGBA', head_ink.size, (255, 255, 255, 255))
    reg.alpha_composite(head_ink)
    Minv0 = np.linalg.inv(M_sk2hd)
    sk_on_head = lib.warp_rgba(skull_ink, lambda p: apply(Minv0, p), head_ink.size)
    arr = np.asarray(sk_on_head).copy()
    arr[..., 0] = 210; arr[..., 1] = 20; arr[..., 2] = 20
    arr[..., 3] = (arr[..., 3] * 0.8).astype(np.uint8)
    reg.alpha_composite(Image.fromarray(arr, 'RGBA'))
    rd = ImageDraw.Draw(reg)
    rd.line([tuple(p) for p in HD_CUT], fill=(0, 0, 255), width=2)
    for k, (x, y) in HD.items():
        rd.ellipse((x - 4, y - 4, x + 4, y + 4), outline=(0, 140, 0), width=2)
        rd.text((x + 6, y - 6), k, fill=(0, 100, 0))
    for k in ['crest', 'orbit', 'angle', 'jaw_mid', 'incisors', 'bars', 'chin', 'nose', 'joint']:
        x, y = apply(M_sk2hd, [SK[k]])[0]
        rd.ellipse((x - 4, y - 4, x + 4, y + 4), outline=(200, 0, 0), width=2)
    reg.convert('RGB').save('%s/reg-check.png' % OUT)

    poll, lip = np.array(HD['poll_skin'], dtype=np.float64), np.array(HD['lip'], dtype=np.float64)
    k_h = HEAD_LEN / np.linalg.norm(lip - poll)
    face_src = math.degrees(math.atan2(lip[1] - poll[1], -(lip[0] - poll[0])))  # after mirroring
    joint_hd = apply(M_sk2hd, [SK['joint']])[0]

    keep = half_plane_mask(head_mask.shape, HD_CUT)
    head_cut = head_mask & keep
    cut_band = band_mask(head_mask.shape, HD_CUT, 9)
    crest_j, throat_j = np.array(HD_CREST_J, dtype=np.float64), np.array(HD_THROAT_J, dtype=np.float64)
    ghost = feather_mask(head_mask.shape, [g for g in HD_GHOST if g[0] != 'eye']) * head_cut
    hi = np.asarray(head_ink).astype(np.float32)
    hi[..., 3] *= ghost
    ghost_rgba = Image.fromarray(hi.astype(np.uint8), 'RGBA')
    eye_g = feather_mask(head_mask.shape, [g for g in HD_GHOST if g[0] == 'eye'])
    he = np.asarray(head_ink).astype(np.float32)
    he[..., 3] *= eye_g
    eye_rgba = Image.fromarray(he.astype(np.uint8), 'RGBA')
    orbit_hd = apply(M_sk2hd, [SK['orbit']])[0]
    eye_shift = orbit_hd - np.array(HD['eye'], dtype=np.float64)
    print('eye ghost moved onto the orbit by', np.round(eye_shift, 1))
    mask_rgba = np.zeros(head_mask.shape + (4,), dtype=np.uint8)
    mask_rgba[..., 3] = head_cut * 255
    mask_rgba[..., 0] = cut_band * 255
    mask_rgba = Image.fromarray(mask_rgba, 'RGBA')
    head_px = np.argwhere(head_cut)[::150][:, ::-1]
    head_wide = lib.dilate(head_cut, 14)

    sizes, anchors_out, sheet = {}, {}, []
    for pid in ORDER:
        pose = POSES[pid]
        M_hd = rot(pose['face'] - face_src) @ scale(-k_h, k_h) @ trans(-joint_hd[0], -joint_hd[1])
        M_sk = M_hd @ M_sk2hd
        s_sk = abs(np.linalg.det(M_sk[:2, :2])) ** 0.5
        seg = np.linalg.norm(np.diff(SK_CHAIN, axis=0), axis=1)
        chain = lib.chain_from_angles((0, 0), seg * s_sk, pose['chain'])
        nrm = lib.normals(chain)
        up = -nrm
        if up[0][1] > 0:
            up = -up
        up_dir = up + np.array([0.0, -1.0])
        up_dir /= np.linalg.norm(up_dir, axis=1, keepdims=True)
        down_dir = -up + np.array([0.0, 1.0])
        down_dir /= np.linalg.norm(down_dir, axis=1, keepdims=True)
        crest_pts = chain + up_dir * (CREST * np.array(pose['crest']))[:, None]
        under_pts = chain + down_dir * (UNDER * np.array(pose['under']))[:, None]
        crest_pts = np.vstack([apply(M_hd, [crest_j]), crest_pts[2:]])
        under_pts = np.vstack([apply(M_hd, [throat_j]), under_pts[3:]])

        # the throat line and the crest stay outside the head: push nodes out of
        # the (dilated) head silhouette along their own offset direction
        def push_out(pts, dirs, M_head):
            Mi = np.linalg.inv(M_head)
            out = pts.copy()
            for i in range(1, len(pts)):
                p = out[i].copy()
                for step in range(40):
                    q = apply(Mi, [p])[0]
                    xq, yq = int(round(q[0])), int(round(q[1]))
                    inside = 0 <= yq < head_wide.shape[0] and 0 <= xq < head_wide.shape[1] and head_wide[yq, xq]
                    if not inside:
                        break
                    p = p + dirs[i] * 5
                out[i] = p
            return out
        flank = np.vstack([chain + nrm * SK_HALF_WIDTH * s_sk, chain - nrm * SK_HALF_WIDTH * s_sk])
        allpts = np.vstack([chain, flank, crest_pts, under_pts, apply(M_hd, head_px)])
        x0, y0 = np.floor(allpts.min(0)) - MARGIN
        x1, y1 = np.ceil(allpts.max(0)) + MARGIN
        T = trans(-x0, -y0)
        W, H = int(x1 - x0), int(y1 - y0)
        M_hd_c, M_sk_c = T @ M_hd, T @ M_sk
        chain_c, crest_c, under_c = apply(T, chain), apply(T, crest_pts), apply(T, under_pts)

        canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        # everything fades out towards the base of the neck (the shoulder is not drawn)
        pa, pb = crest_c[-1], under_c[-1]
        nb = np.array([-(pb - pa)[1], (pb - pa)[0]])
        nb /= np.linalg.norm(nb)
        if (chain_c[-3] - pa) @ nb < 0:
            nb = -nb
        ys_, xs2 = np.mgrid[0:H, 0:W]
        base_fade = np.clip(((xs2 - pa[0]) * nb[0] + (ys_ - pa[1]) * nb[1]) / 110.0, 0, 1).astype(np.float32)

        def faded(img):
            a = np.asarray(img).astype(np.float32)
            a[..., 3] *= base_fade
            return Image.fromarray(a.astype(np.uint8), 'RGBA')
        # 1. neck lines and mane
        lines = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(lines)
        cr = lib.catmull_rom(crest_c, 260)
        un = lib.catmull_rom(under_c, 260)
        rng = np.random.default_rng(7)
        tang = np.gradient(cr, axis=0)
        tang /= np.linalg.norm(tang, axis=1, keepdims=True) + 1e-9
        for i in range(8, int(len(cr) * 0.86), 5):
            n_ = np.array([-tang[i][1], tang[i][0]])
            if n_[1] > 0:
                n_ = -n_
            back = tang[i] if tang[i][0] > 0 else -tang[i]
            dirv = 0.5 * n_ + 0.9 * back
            dirv /= np.linalg.norm(dirv)
            L = rng.uniform(9, 24)
            p0 = cr[i] + n_ * 1.5
            d.line([tuple(p0), tuple(p0 + dirv * L)], fill=INK + (int(rng.uniform(80, 160)),), width=2)
        canvas.alpha_composite(faded(lines))
        # 2. outline of the skin envelope: the head silhouette united with the
        #    neck polygon (crest, base, throat line, closed through the head)
        Minv = np.linalg.inv(M_hd_c)
        wm = np.asarray(lib.warp_rgba(mask_rgba, lambda p: apply(Minv, p), (W, H)))
        m = wm[..., 3] > 127
        inner = apply(M_hd_c, [joint_hd])[0]
        poly = [tuple(p) for p in cr] + [tuple(p) for p in un[::-1]] + [tuple(inner)]
        neck_img = Image.new('L', (W, H), 0)
        ImageDraw.Draw(neck_img).polygon(poly, fill=255)
        env = m | (np.asarray(neck_img) > 127)
        env = lib.erode(lib.dilate(env, 2), 2)
        edge = env & ~lib.erode(env, 1)
        edge_img = Image.fromarray((edge * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.7))
        e = np.asarray(edge_img).astype(np.float32) / 255 * 0.92
        e *= base_fade
        outline = np.zeros((H, W, 4), dtype=np.uint8)
        outline[..., :3] = INK
        outline[..., 3] = (e * 255).astype(np.uint8)
        canvas.alpha_composite(Image.fromarray(outline, 'RGBA'))
        # 3. ghost patches (eye, nostril, mouth, ears)
        canvas.alpha_composite(lib.warp_rgba(ghost_rgba, lambda p: apply(Minv, p), (W, H)))
        Minv_eye = np.linalg.inv(M_hd_c @ trans(eye_shift[0], eye_shift[1]))
        canvas.alpha_composite(lib.warp_rgba(eye_rgba, lambda p: apply(Minv_eye, p), (W, H)))
        # 4. cervical column bent by a thin-plate spline through the chain nodes
        #    and their flanks (fitted canvas -> skeleton crop), shown inside a band
        nrm_src = lib.normals(SK_CHAIN)
        src_pts, dst_pts = [], []
        for i in range(len(SK_CHAIN)):
            for sgn in (-1, 0, 1):
                sp = SK_CHAIN[i] + sgn * SK_HALF_WIDTH * nrm_src[i]
                src_pts.append(sp)
                dst_pts.append(chain_c[i] + sgn * SK_HALF_WIDTH * s_sk * nrm[i])
        tps = lib.TPS(np.array(dst_pts), np.array(src_pts), reg=0.0)
        chain_w = lib.warp_rgba(chain_ink, tps, (W, H))
        band_img = Image.new('L', (W, H), 0)
        ImageDraw.Draw(band_img).line([tuple(p) for p in chain_c], fill=255, width=int(2 * SK_HALF_WIDTH * s_sk + 56), joint='curve')
        band_img = band_img.filter(ImageFilter.GaussianBlur(4))
        cw = np.asarray(chain_w).astype(np.float32)
        cw[..., 3] *= np.asarray(band_img, dtype=np.float32) / 255
        cw[..., 3] *= base_fade
        canvas.alpha_composite(Image.fromarray(cw.astype(np.uint8), 'RGBA'))
        Minv_sk = np.linalg.inv(M_sk_c)
        skull_w = lib.warp_rgba(skull_ink, lambda p: apply(Minv_sk, p), (W, H))
        canvas.alpha_composite(skull_w)
        canvas = canvas.filter(ImageFilter.UnsharpMask(radius=1.0, percent=50, threshold=2))
        bb = canvas.getbbox()
        bx0, by0 = max(0, bb[0] - 6), max(0, bb[1] - 6)
        bx1, by1 = min(W, bb[2] + 6), min(H, bb[3] + 6)
        canvas = canvas.crop((bx0, by0, bx1, by1))
        W, H = canvas.size
        M_sk_c = trans(-bx0, -by0) @ M_sk_c
        canvas.save('%s/%s.png' % (OUT, pid), optimize=True)
        sizes[pid] = [W, H]
        crest_c = crest_c - np.array([bx0, by0])
        under_c = under_c - np.array([bx0, by0])

        up_head = apply(M_sk_c, [SK['crest']])[0] - apply(M_sk_c, [SK['bars']])[0]
        up_head /= np.linalg.norm(up_head)
        side = np.array([-up_head[1], up_head[0]])
        chin_dir = apply(M_sk_c, [SK['chin']])[0] - apply(M_sk_c, [SK['bars']])[0]
        if side @ chin_dir < 0:
            side = -side
        anchors = {
            'bit': apply(M_sk_c, [SK['bars']])[0],
            'poll': apply(M_sk_c, [SK['crest']])[0] + up_head * 10,
            'chin': apply(M_sk_c, [SK['chin']])[0] + side * 12,
            'nose': apply(M_sk_c, [SK['nose']])[0] - side * 14,
        }
        anchors_out[pid] = {k: [int(round(v[0])), int(round(v[1]))] for k, v in anchors.items()}
        tile = Image.new('RGBA', (W, H), (255, 255, 255, 255))
        tile.alpha_composite(canvas)
        td = ImageDraw.Draw(tile)
        for k, col in [('bit', (200, 0, 0)), ('poll', (0, 120, 0)), ('chin', (0, 0, 200)), ('nose', (200, 120, 0))]:
            x, y = anchors[k]
            td.ellipse((x - 6, y - 6, x + 6, y + 6), outline=col, width=3)
        for p in crest_c:
            td.rectangle((p[0] - 3, p[1] - 3, p[0] + 3, p[1] + 3), outline=(0, 150, 0))
        for p in under_c:
            td.rectangle((p[0] - 3, p[1] - 3, p[0] + 3, p[1] + 3), outline=(0, 0, 220))
        td.text((10, 10), pid + '  %dx%d' % (W, H), fill=(120, 0, 0))
        sheet.append(tile.convert('RGB'))
        print(pid, (W, H), anchors_out[pid])

    json.dump({'sizes': sizes, 'anchors': anchors_out}, open('%s/anchors.json' % OUT, 'w'), indent=1)
    tw = max(t.width for t in sheet)
    th = max(t.height for t in sheet)
    k = 560 / tw
    cols = 3
    sh = Image.new('RGB', (int(tw * k) * cols + 40, int(th * k) * 2 + 30), 'white')
    for i, t in enumerate(sheet):
        t2 = t.resize((int(t.width * k), int(t.height * k)), Image.LANCZOS)
        sh.paste(t2, (10 + (i % cols) * (int(tw * k) + 10), 10 + (i // cols) * (int(th * k) + 10)))
    sh.save('%s/sheet.png' % OUT)


if __name__ == '__main__':
    main()
