import base64
import json

import numpy as np

# array type mapping from javascript to numpy
TYPE_MAP = {
    'Int8Array':            np.int8,
    'Uint8Array':           np.uint8,
    'Uint8ClampedArray':    np.uint8,
    'Int16Array':           np.int16,
    'Uint16Array':          np.uint16,
    'Int32Array':           np.int32,
    'Uint32Array':          np.uint32,
    'Float32Array':         np.float32,
    'Float64Array':         np.float64,
}

def parse_ndarray(ndarray):
    byte_buffer = base64.b64decode(ndarray['data'])
    return np.frombuffer(byte_buffer, dtype=TYPE_MAP[ndarray['type']]).reshape(ndarray['shape'])

class SimResult:
    """ class abstraction of simulation results """

    def __init__(self, inputs, grid_n, concentration_tsn, cH_tn, time_t):
        """
        Args:
            inputs:             all simulation inputs
            grid_n:             spatial discretization grid of the channel domain
            concentration_tsn:  all time slices of concentration matrix in [mole / m^3]
            cH_tn:              all time slices of Hydrogen ion concentration in [mole / liter]
            time_t:             simulated time steps

        Note:
            <variable name>_xyz is a naming convention for an array of shape (x, y, z)
            Dimension Definition:
                n:  number of grid points
                s:  number of species
                t:  number of time steps
        """
        self.inputs = inputs
        self.grid_n = grid_n
        self.concentration_tsn = concentration_tsn
        self.cH_tn = cH_tn
        self.time_t = time_t

    @staticmethod
    def from_file(result_file):
        with open(result_file, 'r') as f:
            result = json.load(f)
        inp = result['input']
        oup = result['output']
        return SimResult(
            inputs=inp,
            grid_n=np.linspace(0, inp['domainLen'], inp['numGrids'], endpoint=False),
            concentration_tsn=parse_ndarray(oup['concentration_tsn']),
            cH_tn=parse_ndarray(oup['cH_tn']),
            time_t=parse_ndarray(oup['time_t'])
        )

