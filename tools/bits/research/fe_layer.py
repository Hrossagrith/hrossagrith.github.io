"""Plane-strain finite-element contact of a rigid cylinder on a thin elastic layer
bonded to rigid bone (the bar mucosa), half model by symmetry.

Q4 elements with selective reduced integration (volumetric part at one point) to
avoid locking for a nearly incompressible layer. Frictionless contact solved by
an active-set loop; the indentation depth is found by bisection on the line load.
Linear elasticity: valid for the pressure distribution shape at moderate strain;
large-strain hyperelastic effects are reported as a limitation.
Sources for inputs: mucosa 1-2 mm (Anttila 2022 citing Engelke & Gasse 2003);
modulus 0.08-1 MPa (Sawada 2011; Chen 2015); nu 0.40-0.49 (Chen 2016; Chen 2015).
"""
import math
import sys
import numpy as np
import scipy.sparse as sp
import scipy.sparse.linalg as spla


def stiffness(E, nu, nx, ny, dx, dy):
    lam = E * nu / ((1 + nu) * (1 - 2 * nu))
    mu = E / (2 * (1 + nu))
    Ddev = np.array([[2 * mu, 0, 0], [0, 2 * mu, 0], [0, 0, mu]])
    Dvol = lam * np.array([[1, 1, 0], [1, 1, 0], [0, 0, 0]])
    g = 1 / math.sqrt(3)

    def B_at(xi, eta):
        dN_dxi = np.array([-(1 - eta), (1 - eta), (1 + eta), -(1 + eta)]) / 4
        dN_deta = np.array([-(1 - xi), -(1 + xi), (1 + xi), (1 - xi)]) / 4
        dN_dx = dN_dxi * 2 / dx
        dN_dy = dN_deta * 2 / dy
        B = np.zeros((3, 8))
        B[0, 0::2] = dN_dx
        B[1, 1::2] = dN_dy
        B[2, 0::2] = dN_dy
        B[2, 1::2] = dN_dx
        return B

    detJ = dx * dy / 4
    Ke = np.zeros((8, 8))
    for xi in (-g, g):
        for eta in (-g, g):
            B = B_at(xi, eta)
            Ke += B.T @ Ddev @ B * detJ
    B0 = B_at(0, 0)
    Ke += B0.T @ Dvol @ B0 * detJ * 4

    nnx = nx + 1
    rows, cols, vals = [], [], []
    for j in range(ny):
        for i in range(nx):
            n = [j * nnx + i, j * nnx + i + 1, (j + 1) * nnx + i + 1, (j + 1) * nnx + i]
            dofs = np.array([[2 * k, 2 * k + 1] for k in n]).ravel()
            rows.append(np.repeat(dofs, 8))
            cols.append(np.tile(dofs, 8))
            vals.append(Ke.ravel())
    ndof = 2 * nnx * (ny + 1)
    K = sp.csr_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))), shape=(ndof, ndof))
    return K


def solve_contact(E, nu, h, R, line_load, L=12.0, nx=360, ny=30):
    """Half model x in [0, L], y in [0, h]; bone at y=0, symmetry at x=0.
    Returns contact half-width a, pressure profile, max vertical strain."""
    dx, dy = L / nx, h / ny
    K = stiffness(E, nu, nx, ny, dx, dy)
    nnx = nx + 1
    xs = np.arange(nnx) * dx
    top = np.array([ny * nnx + i for i in range(nnx)])
    fixed = set()
    for i in range(nnx):
        fixed.update((2 * i, 2 * i + 1))           # bonded to bone
    for j in range(ny + 1):
        fixed.add(2 * (j * nnx))                    # symmetry: u_x = 0 at x = 0

    def run(depth):
        active = np.where(depth - xs ** 2 / (2 * R) > 0)[0]
        for _ in range(50):
            presc = {2 * top[i] + 1: -(depth - xs[i] ** 2 / (2 * R)) for i in active}
            fx = sorted(fixed | set(presc))
            free = np.setdiff1d(np.arange(K.shape[0]), fx)
            u = np.zeros(K.shape[0])
            for d, v in presc.items():
                u[d] = v
            rhs = -K[free][:, fx] @ u[fx]
            u[free] = spla.spsolve(K[free][:, free].tocsc(), rhs)
            reac = K @ u
            fy = np.array([reac[2 * top[i] + 1] for i in range(nnx)])
            # contact force on the layer is downward: reaction at prescribed node negative
            tensile = [i for i in active if fy[i] > 1e-12]
            uy_top = u[2 * top + 1]
            gap = uy_top + (depth - xs ** 2 / (2 * R))   # >0 means penetration
            newly = [i for i in range(nnx) if i not in set(active) and gap[i] > 1e-9]
            if not tensile and not newly:
                break
            act = set(active) - set(tensile) | set(newly)
            active = np.array(sorted(act), dtype=int)
        load_half = -fy[active].sum()
        return u, fy, active, load_half

    target = line_load / 2  # half model, N per mm of bar length
    lo, hi = 0.0, h * 0.9
    for _ in range(40):
        mid = (lo + hi) / 2
        _, _, _, f = run(mid)
        lo, hi = (mid, hi) if f < target else (lo, mid)
    u, fy, active, f = run(hi)
    trib = np.full(nnx, dx)
    trib[0] = trib[-1] = dx / 2
    p = -fy / trib
    p[0] *= 1  # symmetry node carries half tributary; pressure value consistent
    a = xs[active].max() if len(active) else 0
    uy = u[1::2].reshape(ny + 1, nnx)
    eyy = np.diff(uy, axis=0) / dy
    return dict(depth=hi, a=a, p=p, xs=xs, p_peak=p.max(), p_mean=line_load / (2 * a) if a else float("nan"),
                strain_max=-eyy.min(), load=2 * f)


def chord(r, delta):
    d = min(delta, r)
    return 2 * math.sqrt(max(0.0, 2 * r * d - d * d))


if __name__ == "__main__":
    print("bit d | mucosa h | E MPa | nu | line load N/mm | FE half-width a | FE mean kPa | FE peak kPa | "
          "peak/mean | max strain | chord-model width | chord-model kPa")
    for d in (10, 16, 22):
        for h in (1.0, 1.5, 2.0):
            for E in (0.1, 0.3, 1.0):
                for q in (0.5,):
                    res = solve_contact(E, 0.45, h, d / 2, q)
                    w = chord(d / 2, h)
                    print(f"{d:>4} | {h:.1f} | {E:.1f} | 0.45 | {q:.2f} | {res['a']:.2f} | {res['p_mean'] * 1000:.0f} | "
                          f"{res['p_peak'] * 1000:.0f} | {res['p_peak'] / res['p_mean']:.2f} | {res['strain_max']:.2f} | "
                          f"{w:.1f} | {q / w * 1000:.0f}")
                    sys.stdout.flush()
