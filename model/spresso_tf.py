import argparse
import os
import uuid

from pathlib import Path
import tensorflow as tf

F = 96500.      # Faraday constant [C/mol]
R = 8.314       # Gas constant [J/(mol K)]
T = 298         # Room Temperature [K]
uH = 362e-9     # mobility of H+ ions
uOH = 205e-9    # mobility of OH- ions
lit2met = 1e3   # mole / lit ==> mole / m^3
Kw = 1e-14

# for reference only
RK45_TABLEAU = {
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

# dormand prince algorithm used by MatLAB's ode45
DORPRI54_TABLEAU = {
    'beta': [
        [1/5],
        [3/40,       9/40],
        [44/45,      -56/15,      32/9],
        [19372/6561, -25360/2187, 64448/6561, -212/729],
        [9017/3168,  -355/33,     46732/5247, 49/176,  -5103/18656],
        [35/384,     0,           500/1113,   125/192, -2187/6784, 11/84],
    ],
    'c4': [5179/57600, 0, 7571/16695, 393/640, -92097/339200, 187/2100, 1/40],
}

class SpressoPH(tf.Module):
    """ Tensorflow implementation of Spresso initial pH calculation """
    def __init__(self):
        super(SpressoPH, self).__init__()

    def lz_func(self, cH_n, c_mat_sn, l_mat_sd, val_mat_sd):
        max_deg = tf.shape(l_mat_sd)[1]

        cH_log_n = tf.math.log(cH_n)
        cH_mat_log_nd = tf.tile(tf.expand_dims(cH_log_n, axis=1), (1, max_deg))
        cH_mat_log_cumsum_nd = tf.cumsum(cH_mat_log_nd, axis=1, exclusive=True)
        cH_mat_nd = tf.exp(cH_mat_log_cumsum_nd)
        temp_mat_sn = tf.reduce_sum(tf.expand_dims(l_mat_sd, axis=1) * \
                                    tf.expand_dims(cH_mat_nd, axis=0), axis=2)

        m1_mat_sn = tf.math.divide_no_nan(c_mat_sn, temp_mat_sn)
        ciz_cube_snd = tf.expand_dims(l_mat_sd, axis=1) * \
                       tf.expand_dims(cH_mat_nd, axis=0) * \
                       tf.expand_dims(m1_mat_sn, axis=2)

        temp_z_sn = tf.reduce_sum(tf.expand_dims(val_mat_sd, axis=1) * \
                                  tf.expand_dims(l_mat_sd, axis=1) * \
                                  tf.expand_dims(cH_mat_nd, axis=0), axis=2)
        rhs_den_n = tf.reduce_sum(tf.reduce_sum(
            ciz_cube_snd * tf.expand_dims(val_mat_sd, axis=1)**2, axis=2), axis=0)
        rhs_num_n = tf.reduce_sum(ciz_cube_snd * tf.expand_dims(val_mat_sd, axis=1), axis=(0,2))

        f_n = rhs_num_n + cH_n - Kw / cH_n
        f_p_n = rhs_den_n / cH_n + 1.0 + Kw / cH_n**2
        inc_n = f_n / f_p_n

        return inc_n

    @tf.function(input_signature=[
        tf.TensorSpec([None, None], name='c_mat_sn'),
        tf.TensorSpec([None, None], name='l_mat_sd'),
        tf.TensorSpec([None, None], name='val_mat_sd'),
    ])
    def __call__(self, c_mat_sn, l_mat_sd, val_mat_sd):
        c_mat_sn = c_mat_sn / lit2met
        # initial guess pH == 7
        cH_n = tf.ones(tf.shape(c_mat_sn)[1], dtype=tf.float32) * 1e-7
        inc_n = tf.ones_like(cH_n)
        while tf.norm(inc_n) / tf.reduce_max(cH_n) > 1e-4:
            inc_n = self.lz_func(cH_n, c_mat_sn, l_mat_sd, val_mat_sd)
            cH_n = cH_n - inc_n 

        return cH_n


class SpressoSim(tf.Module):
    """ Tensorflow implementation of Spresso simulation step """
    def __init__(self):
        super(SpressoSim, self).__init__()

    def lz_func(self, cH_n, c_mat_sn, l_mat_sd, val_mat_sd):
        max_deg = tf.shape(l_mat_sd)[1]

        cH_log_n = tf.math.log(cH_n)
        cH_mat_log_nd = tf.tile(tf.expand_dims(cH_log_n, axis=1), (1, max_deg))
        cH_mat_log_cumsum_nd = tf.cumsum(cH_mat_log_nd, axis=1, exclusive=True)
        cH_mat_nd = tf.exp(cH_mat_log_cumsum_nd)
        temp_mat_sn = tf.reduce_sum(tf.expand_dims(l_mat_sd, axis=1) * \
                                    tf.expand_dims(cH_mat_nd, axis=0), axis=2)

        m1_mat_sn = tf.math.divide_no_nan(c_mat_sn, temp_mat_sn)
        ciz_cube_snd = tf.expand_dims(l_mat_sd, axis=1) * \
                       tf.expand_dims(cH_mat_nd, axis=0) * \
                       tf.expand_dims(m1_mat_sn, axis=2)

        temp_z_sn = tf.reduce_sum(tf.expand_dims(val_mat_sd, axis=1) * \
                                  tf.expand_dims(l_mat_sd, axis=1) * \
                                  tf.expand_dims(cH_mat_nd, axis=0), axis=2)
        rhs_den_n = tf.reduce_sum(tf.reduce_sum(
            ciz_cube_snd * tf.expand_dims(val_mat_sd, axis=1)**2 - \
                ciz_cube_snd * tf.expand_dims(val_mat_sd, axis=1) * \
                tf.expand_dims(temp_z_sn, axis=2) / tf.expand_dims(temp_mat_sn, axis=2), 
        axis=2), axis=0)
        rhs_num_n = tf.reduce_sum(ciz_cube_snd * tf.expand_dims(val_mat_sd, axis=1), axis=(0,2))

        f_n = rhs_num_n + cH_n - Kw / cH_n
        f_p_n = rhs_den_n / cH_n + 1.0 + Kw / cH_n**2
        inc_n = f_n / f_p_n

        return inc_n, cH_mat_nd, temp_mat_sn

    def lz_calc_equilibrium(self, cH_n, c_mat_sn, l_mat_sd, val_mat_sd):
        c_mat_sn = c_mat_sn / lit2met
        # 1st newton iterations
        inc_n, cH_mat_nd, temp_mat_sn = self.lz_func(cH_n, c_mat_sn, l_mat_sd, val_mat_sd)
        cH_n = cH_n - inc_n 
        # 2nd newton iterations
        inc_n, cH_mat_nd, temp_mat_sn = self.lz_func(cH_n, c_mat_sn, l_mat_sd, val_mat_sd)
        cH_n = cH_n - inc_n 

        giz_cube_snd = tf.expand_dims(l_mat_sd, axis=1) * \
                       tf.expand_dims(cH_mat_nd, axis=0) / \
                       tf.expand_dims(temp_mat_sn, axis=2)

        return cH_n, giz_cube_snd 

    def calc_spatial_properties(self, cH_n, c_mat_sn, 
                                l_mat_sd, val_mat_sd, u_mat_sd, d_mat_sd):
        cH_n, giz_cube_snd = self.lz_calc_equilibrium(cH_n, c_mat_sn, l_mat_sd, val_mat_sd)

        u_cube_snd = tf.expand_dims(u_mat_sd, axis=1) * giz_cube_snd
        d_cube_snd = tf.expand_dims(d_mat_sd, axis=1) * giz_cube_snd

        u_mat_sn = tf.reduce_sum(u_cube_snd, axis=2)
        d_mat_sn = tf.reduce_sum(d_cube_snd, axis=2)
        val_mat_s1d = tf.expand_dims(val_mat_sd, axis=1)
        alpha_mat_sn = F * tf.reduce_sum(val_mat_s1d * u_cube_snd, axis=2)
        beta_mat_sn = F * tf.reduce_sum(val_mat_s1d * d_cube_snd, axis=2)

        sig_vec_n = tf.reduce_sum(alpha_mat_sn * c_mat_sn, axis=0) + \
                    lit2met * F * (uH * cH_n + uOH * Kw / cH_n)
        s_vec_n = tf.reduce_sum(beta_mat_sn * c_mat_sn, axis=0) + \
                    lit2met * R * T * (uH * cH_n - uOH * Kw / cH_n)

        return cH_n, u_mat_sn, d_mat_sn, sig_vec_n, s_vec_n

    def limiter_func(self, x, y):
        """ calculate limiter for SLIP scheme """
        q = 2 # ELED q=2 gives van-leer
        z_xy = tf.abs(x) + tf.abs(y)
        D = 1 - (tf.abs(tf.math.divide_no_nan(x - y, z_xy)))**q
        return 0.5 * D * (x + y)

    def calc_flux(self, c_mat_sn, u_mat_sn, d_mat_sn, sig_vec_n, s_vec_n, current, dx):
        num_species = tf.shape(c_mat_sn)[0]
        num_grid = tf.shape(c_mat_sn)[1]

        sig_vec_1n = tf.expand_dims(sig_vec_n, axis=0)
        s_vec_1n = tf.expand_dims(s_vec_n, axis=0)

        elec_flux_factor0_sn = u_mat_sn * c_mat_sn / sig_vec_1n
        elec_flux_factor_sn = current * u_mat_sn / sig_vec_1n * c_mat_sn

        adv_flux_sm = 0.5 * (elec_flux_factor_sn[:, 1:] + elec_flux_factor_sn[:, :num_grid-1])
        adv_flux_left_s = elec_flux_factor_sn[:, 0]
        adv_flux_right_s = elec_flux_factor_sn[:, num_grid-1]

        v_max_sm = tf.abs(0.5 * current * (u_mat_sn[:, 1:] / sig_vec_1n[:, 1:] + \
                                           u_mat_sn[:, :num_grid-1] / sig_vec_1n[:, :num_grid-1]))
        v_max_1m = tf.reduce_max(v_max_sm, axis=0, keepdims=True)

        molecular_diff_flux_sm = (d_mat_sn[:, 1:] * c_mat_sn[:, 1:] - \
                                  d_mat_sn[:, :num_grid-1] * c_mat_sn[:, :num_grid-1]) / dx;
        elec_diff_flux_sm = .5 * (elec_flux_factor0_sn[:, 1:] + elec_flux_factor0_sn[:, :num_grid-1]) * \
                                 (s_vec_1n[:, 1:] - s_vec_1n[:, :num_grid-1]) / dx
        dc_mat_so = tf.pad(c_mat_sn[:, 1:] - c_mat_sn[:, :num_grid-1], [[0, 0], [1, 1]])
        limit_mat_sm = self.limiter_func(dc_mat_so[:, 2:], dc_mat_so[:, :num_grid-1])

        num_diff_sm = 0.5 * v_max_1m * (c_mat_sn[:, 1:] - c_mat_sn[:, :num_grid-1] - limit_mat_sm)
        diff_flux_sm = elec_diff_flux_sm - molecular_diff_flux_sm

        flux_sm = adv_flux_sm + diff_flux_sm - num_diff_sm

        gradient_mid_sl = -(flux_sm[:,1:]-flux_sm[:,:num_grid-2])/dx
        gradient_left_s1 = tf.expand_dims((adv_flux_left_s - flux_sm[:, 0]) / dx, axis=1)
        gradient_right_s1 = tf.expand_dims((flux_sm[:, num_grid-2] - adv_flux_right_s) / dx, axis=1)

        return tf.concat([gradient_left_s1, gradient_mid_sl, gradient_right_s1], axis=1)

    def integrate(self, c_mat_sn, u_mat_sn, d_mat_sn, sig_vec_n, s_vec_n, current, dx, dt):
        calc_flux = lambda input_sn: self.calc_flux(input_sn, 
                u_mat_sn, d_mat_sn, sig_vec_n, s_vec_n, current, dx)
        T = DORPRI54_TABLEAU['beta']
        k1 = dt * calc_flux(c_mat_sn)
        k2 = dt * calc_flux(c_mat_sn + (T[0][0]*k1))
        k3 = dt * calc_flux(c_mat_sn + (T[1][0]*k1 + T[1][1]*k2))
        k4 = dt * calc_flux(c_mat_sn + (T[2][0]*k1 + T[2][1]*k2 + T[2][2]*k3))
        k5 = dt * calc_flux(c_mat_sn + (T[3][0]*k1 + T[3][1]*k2 + T[3][2]*k3 + T[3][3]*k4))
        k6 = dt * calc_flux(c_mat_sn + (T[4][0]*k1 + T[4][1]*k2 + T[4][2]*k3 + T[4][3]*k4 +
                                        T[4][4]*k5))
        c_mat_5_sn = c_mat_sn + (T[5][0]*k1 + T[5][1]*k2 + T[5][2]*k3 + T[5][3]*k4 +
                                 T[5][4]*k5 + T[5][5]*k6)
        k7 = dt * calc_flux(c_mat_5_sn)

        T = DORPRI54_TABLEAU['c4']
        c_mat_4_sn = c_mat_sn + (T[0]*k1 + T[1]*k2 + T[2]*k3 + T[3]*k4 + T[4]*k5 + 
                                 T[5]*k6 + T[6]*k7)

        error = tf.linalg.norm(c_mat_4_sn - c_mat_5_sn)

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
        c_mat_5_sn = tf.identity(c_mat_sn)
        error = tolerance + 1.
        dt_scale = 1.
        while error > tolerance:
            dt *= dt_scale
            c_mat_5_sn, error = self.integrate(
                c_mat_sn, u_mat_sn, d_mat_sn, sig_vec_n, s_vec_n, current, dx, dt)
            dt_scale = .9 * (tolerance / error)**(1/5)
            dt_scale = tf.clip_by_value(dt_scale, 0.1, 10)

        return cH_n, c_mat_5_sn, dt, dt*dt_scale

def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('-o', '--output', type=str, required=True,
                        help='directory to store the output model')
    return parser.parse_args()

def save_tf_model(model, output_dir, name):
    import tensorflowjs as tfjs
    path = os.path.join('/tmp', str(uuid.uuid4()))
    tf.saved_model.save(model, path)
    tfjs.converters.convert_tf_saved_model(path, os.path.join(output_dir, name),
        strip_debug_ops=True, control_flow_v2=True)

# save the simulation computatation graph as TF Saved Model
if __name__ == '__main__':
    args = parse_args()
    # make sure output path exist
    Path(args.output).mkdir(parents=True, exist_ok=True)
    save_tf_model(SpressoSim(), args.output, 'spresso_sim')
    save_tf_model(SpressoPH(), args.output, 'spresso_ph')
    
