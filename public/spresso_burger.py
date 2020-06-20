import numpy as np

class SpressoBurger:

    def __init__(self, num_grids, domain_len):
        self.num_grids = num_grids
        self.domain_len = domain_len
        self.grid_x = np.linspace(0, domain_len, num_grids)
        self.concentration_tx = [self._init_concentration_x()]
        self.time_t = [0]
        self.dx = self.grid_x[1] - self.grid_x[0]
        self.dt = self.dx

    def calc_flux(self, numeric_step=None):
        rhs = np.zeros_like(self.grid_x)
        c_x = self.concentration_tx[-1].copy()
        if numeric_step is not None:
            c_x += numeric_step
        flux = 0.5*(c_x[1:]**2 + c_x[:-1]**2) - \
               0.5*np.abs(c_x[1:] + c_x[:-1]) * (c_x[1:] - c_x[:-1])
        rhs[1:-1] = (flux[:-1] - flux[1:]) / self.dx
        return rhs

    def simulate_step(self):
        k1 = self.calc_flux()
        k2 = self.calc_flux(0.5*k1*self.dt)
        k3 = self.calc_flux(0.5*k2*self.dt)
        k4 = self.calc_flux(k3*self.dt)
        concentration_x = self.concentration_tx[-1] + \
                          self.dt * (k1 + 2*k2 + 2*k3 + k4) / 6
        self.concentration_tx.append(concentration_x)
        self.time_t.append(self.time_t[-1] + self.dt)

    def get_current_concentration_x(self):
        return self.concentration_tx[-1]

    def get_current_time(self):
        return self.time_t[-1]

    def get_current_step(self):
        return len(self.time_t) - 1

    def _init_concentration_x(self):
        L = self.domain_len
        return np.exp(-(self.grid_x - 0.1*L)**2 / (0.02*L)**2)
