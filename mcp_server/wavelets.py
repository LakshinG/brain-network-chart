import numpy as np
from scipy.linalg import expm
import math
from datetime import datetime
from utils import corrcoef

import os
os.environ['KMP_DUPLICATE_LIB_OK']='True'


def thresholding(fc,  ratio=0.8):
    # keeping T*100% links
    node_num = fc.shape[-1]
    fc[fc < 0] = 0

    fc_tril = np.tril(fc, -1)
    K = np.count_nonzero(fc_tril)
    KT = ratio * ((node_num**2 - node_num) / 2)
    KT = math.ceil(KT)

    if KT >= K:
        thr = 0
    else:
        thr = np.partition(fc_tril.reshape(*fc_tril.shape[:-2], -1), -KT, -1)[
            ..., [[-KT]]
        ]

    fc[fc < thr] = 0

    # if not np.all(np.sum(fc > 0, -1) > 1):
    #     print('the wrong datafile: ', data_path)
    #     warnings.warn('Thresholding is too large, please enlarge the threshold')

    return fc


def harmonic_wavelets(
    graph,
    wavelets_num=10,
    beta=1,
    gamma=0.005,
    max_iter=1000,
    min_err=0.0001,
    node_select=10,
):
    # # Indiviual wavelets
    # node_num = graph.shape[-1]
    # temp_D = np.eye(node_num) * np.sum(graph, axis=-1, keepdims=True)
    # latentlaplacian = temp_D - graph
    # u_vec = np.zeros_like(graph)
    #
    # diag_idx = np.arange(node_num)
    # np.put_along_axis(
    #     u_vec, np.argpartition(graph, -node_select)[..., -node_select:], 1, -1
    # )
    # u_vec[..., diag_idx, diag_idx] = 1
    #
    # temp_v = 1 - u_vec
    # temp_v = np.eye(temp_v.shape[-1]) * np.expand_dims(temp_v, -2)
    # Theta = beta * temp_v
    # _, temp_phi = np.linalg.eigh(latentlaplacian + Theta)
    # phi_k = np.expand_dims(temp_phi[..., :wavelets_num], -3)

    # Common wavelets, still a little error in objective function
    node_num = graph.shape[-1]
    temp_D = np.eye(node_num) * np.sum(graph, axis=-1, keepdims=True)
    latentlaplacian = temp_D - graph
    _, temp_phi = np.linalg.eigh(latentlaplacian)
    u_vec = np.zeros_like(graph)
    phi_k = np.expand_dims(temp_phi[..., :wavelets_num], -3)

    print(f"[{datetime.now().strftime('%H:%M:%S.%f')[:-3]}] [WAVELET] Starting harmonic wavelets computation (wavelets_num={wavelets_num}, beta={beta}, gamma={gamma})")
    it = 0
    err = np.inf
    diag_idx = np.arange(node_num)
    while err > min_err and it < max_iter:
        np.put_along_axis(
            u_vec, np.argpartition(graph, -node_select)[..., -node_select:], 1, -1
        )
        u_vec[..., diag_idx, diag_idx] = 1

        temp_v = 1 - u_vec
        temp_v = np.eye(temp_v.shape[-1]) * np.expand_dims(temp_v, -2)
        Theta = beta * temp_v
        temp_increment = 2 * (np.eye(node_num) - phi_k @ phi_k.swapaxes(-2, -1))
        phi_increment = -gamma * temp_increment @ Theta @ phi_k
        Q, R = np.linalg.qr(
            (np.eye(node_num) - phi_k @ phi_k.swapaxes(-2, -1)) @ phi_increment
        )
        A = phi_k.swapaxes(-2, -1) @ phi_increment
        temp_matrix1 = np.concatenate([A, -R.swapaxes(-2, -1)], -1)
        temp_matrix2 = np.concatenate([R, np.zeros_like(R)], -1)
        temp_matrix3 = np.concatenate([temp_matrix1, temp_matrix2], -2)
        BC = expm(temp_matrix3)[..., :wavelets_num]
        phi_k = phi_k @ BC[..., :wavelets_num, :] + Q @ BC[..., wavelets_num:, :]
        err = np.max(np.linalg.norm(phi_increment, 'fro', (-2, -1)))
        it += 1
        print(f"[{datetime.now().strftime('%H:%M:%S.%f')[:-3]}] [WAVELET]   Iteration {it}/{max_iter}: error={err:.6f}")

    print(f"[{datetime.now().strftime('%H:%M:%S.%f')[:-3]}] [WAVELET] Harmonic wavelets computation complete (iterations={it}, final_error={err:.6f})")
    return phi_k


def harmonics(
    graph,
    wavelets_num=55,
    beta=1,
    gamma=0.005,
    max_iter=1000,
    min_err=0.0001,
):
    node_num = graph.shape[-1]
    temp_D = np.eye(node_num) * np.sum(graph, axis=-1, keepdims=True)
    latentlaplacian = temp_D - graph
    _, temp_phi = np.linalg.eigh(latentlaplacian)
    phi_k = np.expand_dims(temp_phi[..., :wavelets_num], -3)

    # it = 0
    # err = np.inf
    # while err > min_err and it < max_iter:
    #     temp_increment = 2 * (np.eye(node_num) - phi_k @ phi_k.swapaxes(-2, -1))
    #     phi_increment = -gamma * temp_increment @ phi_k
    #     Q, R = np.linalg.qr(
    #         (np.eye(node_num) - phi_k @ phi_k.swapaxes(-2, -1)) @ phi_increment
    #     )
    #     A = phi_k.swapaxes(-2, -1) @ phi_increment
    #     temp_matrix1 = np.concatenate([A, -R.swapaxes(-2, -1)], -1)
    #     temp_matrix2 = np.concatenate([R, np.zeros_like(R)], -1)
    #     temp_matrix3 = np.concatenate([temp_matrix1, temp_matrix2], -2)
    #     BC = expm(temp_matrix3)[..., :wavelets_num]
    #     phi_k = phi_k @ BC[..., :wavelets_num, :] + Q @ BC[..., wavelets_num:, :]
    #     err = np.max(np.linalg.norm(phi_increment, 'fro', (-2, -1)))
    #     it += 1
    #     print(it, err)

    return phi_k


def cfc(wavelets, bold, wavelets_num):
    # a = np.expand_dims(wavelets[..., :wavelets_num].swapaxes(-2, -1), -3)
    # b = np.expand_dims(np.expand_dims(bold.swapaxes(-2, -1), -2), -4)
    # c = a*b
    powers = np.sum(
        np.expand_dims(wavelets[..., :wavelets_num].swapaxes(-2, -1), -3)
        * np.expand_dims(np.expand_dims(bold.swapaxes(-2, -1), -2), -4),
        -1,
    )
    cfcs = corrcoef(powers.swapaxes(-2, -1))
    return cfcs, powers
