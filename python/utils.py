import base64
import json
import os

import numpy as np

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
    def from_directory(directory):
        """
        Args:
            directory: directory that stores the uncompressed result files

        Returns:
            a parsed SimResult object containing all the simulation result data as well
            as experimental setup
        """
        input_file = os.path.join(directory, "inputs.json")
        concentration_tsn_file = os.path.join(directory, "concentration_tsn.bin")
        cH_tn_file = os.path.join(directory, "cH_tn.bin")
        time_t_file = os.path.join(directory, "time_t.bin")

        with open(input_file, 'r') as f:
            inputs = json.load(f)

        num_grids = inputs["numGrids"]
        num_species = len(inputs["species"])

        concentration_tsn = np.fromfile(
            concentration_tsn_file, dtype=np.float32).reshape(-1, num_species, num_grids)
        cH_tn = np.fromfile(cH_tn_file, dtype=np.float32).reshape(-1, num_grids)
        time_t = np.fromfile(time_t_file, dtype=np.float32)

        return SimResult(
            inputs=inputs,
            grid_n=np.linspace(0, inputs['domainLen'], inputs['numGrids'], endpoint=False),
            concentration_tsn=concentration_tsn,
            cH_tn=cH_tn,
            time_t=time_t
        )

