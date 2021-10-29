from utils import SimResult
import numpy as np
import scipy.io
import argparse

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description='Converts CAFES results into MATLAB table.')
    parser.add_argument('-filename', type=str,
                        help='Location of the CAFES result file')
    args = parser.parse_args()
    filename = args.filename
    filetag = input('Name of the MATLAB data file : ')

    sim_results = SimResult.from_directory(filename)
    scipy.io.savemat(filetag+".mat", {
        'ctable': sim_results.concentration_tsn,
        'cH': sim_results.cH_tn,
        'efield': sim_results.efield_tn,
        'time': sim_results.time_t,
        'grid': sim_results.grid_n,
    })
