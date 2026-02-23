import numpy as np

def corrcoef(X):
    avg = X.mean(-1)
    X = X - avg[..., None]
    X_T = X.swapaxes(-2, -1)
    c = X @ X_T
    d = c.diagonal(0, -2, -1)
    stddev = np.sqrt(d)
    denom = stddev[..., None] * stddev[..., None, :]
    with np.errstate(invalid="ignore", divide="ignore"):
        np.divide(c, denom, out=c, where=denom != 0)
    np.clip(c, -1, 1, out=c)
    return c