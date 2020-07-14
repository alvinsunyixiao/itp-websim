import argparse
import tensorflow as tf

from pathlib import Path

F = 96500.      # Faraday constant [C/mol]
R = 8.314       # Gas constant [J/(mol K)]
T = 298         # Room Temperature [K]
uH = 362e-9     # mobility of H+ ions
uOH = 205e-9    # mobility of OH- ions
Kw = 1e-14

RK45_TABLE = {
    'beta': [
        [1/4],
        [3/32,       9/32],
        [1932/2197, -7200/2197,  7296/2197],
        [439/216,    -8,         3680/513,   -845/4104],
        [-8/27,      2,          -3544/2565, 1859/4104,  -11/40],
    ],
    'c4': [25/216, 0, 1408/2565, 2197/4104, -1/5],
    'c5': [16/135, 0, 6656/12825, 28561/56430, -9/50, 2/55],
}

class SpressoTF(tf.Module):
    """ Tensorflow implementation of Spresso simulation step """
    def __init__(self):
        super(SpressoTF, self).__init__()

    def lz_func(self, cH_n, c_mat_sn, l_mat_sd, val_mat_sd, approx):
        num_species = tf.shape(c_mat_sn)[0]
        num_grid = tf.shape(c_mat_sn)[1]
        max_deg = tf.shape(l_mat_sd)[1]

        ones_n1 = tf.ones((num_grid, 1))
        cH_log_n = tf.math.log(cH_n)
        cH_mat_log_nd = tf.tile(cH_log_n[:, None], (1, max_deg))
        cH_mat_log_cumsum_nd = tf.cumsum(cH_mat_log_nd, axis=-1, exclusive=True)
        cH_mat_nd = tf.exp(cH_mat_log_cumsum_nd)
        temp_mat_sn = tf.reduce_sum(l_mat_sd[:, None, :] * cH_mat_nd[None], axis=-1)

        m1_mat_sn = c_mat_sn / temp_mat_sn
        ciz_cube_snd = l_mat_sd[:, None, :] * cH_mat_nd[None] * m1_mat_sn[..., None]

        temp_z_sn = tf.reduce_sum(
            val_mat_sd[:, None, :] * l_mat_sd[:, None, :] * cH_mat_nd[None], axis=-1)
        rhs_den_n = tf.reduce_sum(
            ciz_cube_snd * val_mat_sd[:, None, :]**2 - \
                approx * ciz_cube_snd * val_mat_sd[:, None, :] * \
                temp_z_sn[..., None] / temp_mat_sn[..., None], 
        axis=(0,2))
        rhs_num_n = tf.reduce_sum(ciz_cube_snd * val_mat_sd[:, None, :], axis=(0,2))

        F_n = rhs_num_n + cH_n - Kw / cH_n
        F_prime_n = rhs_den_n / cH_n + 1.0 + Kw / cH_n**2

        return F_n, F_prime_n, cH_mat_nd, temp_mat_sn

    def lz_calc_equilibrium(self, cH_n, c_mat_sn, l_mat_sd, val_mat_sd):
        cH_backup_n = cH_n
        F_n, F_prime_n, cH_mat_nd, temp_mat_sn = \
            self.lz_func(cH_n, c_mat_sn, l_mat_sd, val_mat_sd, 1.0)
        inc_n = F_n / F_prime_n
        while tf.norm(F_n) > 1e-6 and tf.norm(inc_n) > 1e-9 and tf.reduce_min(cH_n) > 0.:
            cH_n = cH_n - inc_n 
            F_n, F_prime_n, cH_mat_nd, temp_mat_sn = \
                self.lz_func(cH_n, c_mat_sn, l_mat_sd, val_mat_sd, 1.0)
            inc_n = F_n / F_prime_n
        # fast optimization failed, do it slowly
        if tf.reduce_min(cH_n) < 0.0:
            cH_n = cH_backup_n
            F_n, F_prime_n, cH_mat_nd, temp_mat_sn = \
                self.lz_func(cH_n, c_mat_sn, l_mat_sd, val_mat_sd, 0.)
            inc_n = F_n / F_prime_n
            while tf.norm(F_n) > 1e-6 and tf.norm(inc_n) > 1e-9:
                cH_n = cH_n - inc_n 
                F_n, F_prime_n, cH_mat_nd, temp_mat_sn = \
                    self.lz_func(cH_n, c_mat_sn, l_mat_sd, val_mat_sd, 0.)
                inc_n = F_n / F_prime_n

        giz_cube_snd = l_mat_sd[:, None, :] * cH_mat_nd[None] / temp_mat_sn[..., None]

        return cH_n, giz_cube_snd


    def calc_spatial_properties(self, cH_n, c_mat_sn, 
                                l_mat_sd, val_mat_sd, u_mat_sd, d_mat_sd):
        cH_n, giz_cube_snd = self.lz_calc_equilibrium(cH_n, c_mat_sn, l_mat_sd, val_mat_sd)

        u_cube_snd = u_mat_sd[:, None, :] * giz_cube_snd
        d_cube_snd = d_mat_sd[:, None, :] * giz_cube_snd

        u_mat_sn = tf.reduce_sum(u_cube_snd, axis=2)
        d_mat_sn = tf.reduce_sum(d_cube_snd, axis=2)
        alpha_mat_sn = F * tf.reduce_sum(val_mat_sd[:, None, :] * u_cube_snd, axis=2)
        beta_mat_sn = F * tf.reduce_sum(val_mat_sd[:, None, :] * d_cube_snd, axis=2)

        sig_vec_n = tf.reduce_sum(alpha_mat_sn * c_mat_sn, axis=0) + \
                    F * (uH * cH_n + uOH * Kw / cH_n)
        s_vec_n = tf.reduce_sum(beta_mat_sn * c_mat_sn, axis=0) + \
                  R * T * (uH * cH_n - uOH * Kw / cH_n)

        return cH_n, u_mat_sn, d_mat_sn, sig_vec_n, s_vec_n

    def limiter_func(self, x, y):
        """ calculate limiter for SLIP scheme """
        q = 2 # ELED q=2 gives van-leer
        z_xy = tf.abs(x) + tf.abs(y)
        D = 1 - (tf.abs(tf.math.divide_no_nan(x - y, z_xy)))**q
        return 0.5 * D * (x + y)

    def calc_flux(self, c_mat_sn, u_mat_sn, d_mat_sn, sig_vec_n, s_vec_n, current, dx):
        num_species = tf.shape(c_mat_sn)[0]

        elec_flux_factor0_sn = u_mat_sn * c_mat_sn / sig_vec_n[None]
        elec_flux_factor_sn = current * u_mat_sn / sig_vec_n[None] * c_mat_sn

        adv_flux_sm = 0.5 * (elec_flux_factor_sn[:, 1:] + elec_flux_factor_sn[:, :-1])
        adv_flux_left_s = elec_flux_factor_sn[:, 0]
        adv_flux_right_s = elec_flux_factor_sn[:, -1]

        v_max_sm = tf.abs(0.5 * current * (u_mat_sn[:, 1:] / sig_vec_n[None, 1:] + \
                                           u_mat_sn[:, :-1] / sig_vec_n[None, :-1]))
        v_max_1m = tf.reduce_max(v_max_sm, axis=0, keepdims=True)

        molecular_diff_flux_sm = (d_mat_sn[:, 1:] * c_mat_sn[:, 1:] - \
                                  d_mat_sn[:, :-1] * c_mat_sn[:, :-1]) / dx;
        elec_diff_flux_sm = .5 * (elec_flux_factor0_sn[:, 1:] + elec_flux_factor0_sn[:, :-1]) * \
                                 (s_vec_n[None, 1:] - s_vec_n[None, :-1]) / dx
        dc_mat_so = tf.pad(c_mat_sn[:, 1:] - c_mat_sn[:, :-1], [[0, 0], [1, 1]])
        limit_mat_sm = self.limiter_func(dc_mat_so[:, 2:], dc_mat_so[:, :-2])

        num_diff_sm = 0.5 * v_max_1m * (c_mat_sn[:, 1:] - c_mat_sn[:, :-1] - limit_mat_sm)
        diff_flux_sm = elec_diff_flux_sm - molecular_diff_flux_sm

        flux_sm = adv_flux_sm + diff_flux_sm - num_diff_sm

        gradient_mid_sl = -(flux_sm[:,1:]-flux_sm[:,:-1])/dx
        gradient_left_s1 = tf.expand_dims((adv_flux_left_s - flux_sm[:, 0]) / dx, axis=1)
        gradient_right_s1 = tf.expand_dims((flux_sm[:, -1] - adv_flux_right_s) / dx, axis=1)

        return tf.concat([gradient_left_s1, gradient_mid_sl, gradient_right_s1], axis=-1)

    def rk45(self, c_mat_sn, u_mat_sn, d_mat_sn, sig_vec_n, s_vec_n, current, dx, dt):
        calc_flux = lambda input_sn: self.calc_flux(input_sn, 
                u_mat_sn, d_mat_sn, sig_vec_n, s_vec_n, current, dx)
        T = RK45_TABLE['beta']
        k1 = dt * calc_flux(c_mat_sn)
        k2 = dt * calc_flux(c_mat_sn + (T[0][0]*k1))
        k3 = dt * calc_flux(c_mat_sn + (T[1][0]*k1 + T[1][1]*k2))
        k4 = dt * calc_flux(c_mat_sn + (T[2][0]*k1 + T[2][1]*k2 + T[2][2]*k3))
        k5 = dt * calc_flux(c_mat_sn + (T[3][0]*k1 + T[3][1]*k2 + T[3][2]*k3 + T[3][3]*k4))
        k6 = dt * calc_flux(c_mat_sn + (T[4][0]*k1 + T[4][1]*k2 + T[4][2]*k3 + T[4][3]*k4 
                                                   + T[4][4]*k5))

        T = RK45_TABLE['c4']
        c_mat_4_sn = c_mat_sn + (T[0]*k1 + T[1]*k2 + T[2]*k3 + T[3]*k4 + T[4]*k5)
        T = RK45_TABLE['c5']
        c_mat_5_sn = c_mat_sn + (T[0]*k1 + T[1]*k2 + T[2]*k3 + T[3]*k4 + T[4]*k5 + T[5]*k6)

        error = tf.reduce_max(tf.abs(c_mat_4_sn - c_mat_5_sn)) / dt

        return c_mat_5_sn, error
        
    @tf.function(input_signature=(
        tf.TensorSpec(shape=[None], name='cH_n'),
        tf.TensorSpec(shape=[None, None], name='c_mat_sn'),
        tf.TensorSpec(shape=[None, None], name='l_mat_sd'),
        tf.TensorSpec(shape=[None, None], name='val_mat_sd'),
        tf.TensorSpec(shape=[None, None], name='u_mat_sd'),
        tf.TensorSpec(shape=[None, None], name='d_mat_sd'),
        tf.TensorSpec(shape=[], name='current'),
        tf.TensorSpec(shape=[], name='dx'),
        tf.TensorSpec(shape=[], name='dt'),
        tf.TensorSpec(shape=[], name='tolerance'),
    ))
    def __call__(self, cH_n, c_mat_sn, l_mat_sd, val_mat_sd, u_mat_sd, d_mat_sd, 
                 current, dx, dt, tolerance):
        # chemical equillibrium
        cH_n, u_mat_sn, d_mat_sn, sig_vec_n, s_vec_n = self.calc_spatial_properties(
            cH_n, c_mat_sn, l_mat_sd, val_mat_sd, u_mat_sd, d_mat_sd)
        # perform integration
        c_mat_5_sn = c_mat_sn
        error = tolerance + 1.
        while error > tolerance:
            c_mat_5_sn, error = self.rk45(
                c_mat_sn, u_mat_sn, d_mat_sn, sig_vec_n, s_vec_n, current, dx, dt)
            dt_scale = .84 * tf.math.divide_no_nan(tolerance, error)**(1/4)
            dt_scale = tf.clip_by_value(dt_scale, 0.1, 10)
            dt *= dt_scale

        return cH_n, c_mat_5_sn, dt 

def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('-o', '--output', type=str, required=True,
                        help='directory to store the output model')
    return parser.parse_args()

# save the simulation computatation graph as TF Saved Model
if __name__ == '__main__':
    args = parse_args()
    # make sure output path exist
    Path(args.output).mkdir(parents=True, exist_ok=True)
    spresso = SpressoTF()    
    tf.saved_model.save(spresso, args.output) 
