import json, math, itertools, sys
import fe_layer as f
rows = []
for d, h, E, nu, q in itertools.product((10, 16, 22), (1.0, 1.5, 2.0), (0.1, 0.3, 1.0), (0.40, 0.45, 0.47), (0.5, 1.5, 4.0)):
    r = f.solve_contact(E, nu, h, d / 2, q, nx=240, ny=20)
    rows.append(dict(d=d, h=h, E=E, nu=nu, q=q, a=r["a"], p_mean=r["p_mean"], p_peak=r["p_peak"], strain=r["strain_max"], depth=r["depth"]))
    print(json.dumps(rows[-1])); sys.stdout.flush()
json.dump(rows, open("fe_grid.json", "w"), indent=1)
