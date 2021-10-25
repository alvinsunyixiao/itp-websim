from utils import SimResult
import numpy as np
import scipy.io
import argparse

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description='Converts SWIFT results into MATLAB table.')
    parser.add_argument('-filename', type=str,
                        help='Location of the SWIFT result file')
    args = parser.parse_args()
    filename = args.filename
    filetag = input('Name of the MATLAB data file : ')
    scipy.io.savemat(filetag+".mat", {
        'ctable': np.array(SimResult.from_directory(
            filename).concentration_tsn),
        'cH': np.array(SimResult.from_directory(filename).cH_tn),
        'time': np.array(SimResult.from_directory(filename).time_t),
        'grid': np.array(SimResult.from_directory(filename).grid_n),
    })
