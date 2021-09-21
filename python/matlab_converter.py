from analysis import *
from utils import *
import matplotlib.pyplot as plt 
import numpy as np 
import matplotlib.animation as animation
import os
import pandas as pd
import scipy.io

os.chdir("./")

filename = './result/Simulation Results/'
concentrations_table = np.array(SimResult.from_directory(filename).concentration_tsn)
grid = np.array(SimResult.from_directory(filename).grid_n)
cH = np.array(SimResult.from_directory(filename).cH_tn)
time = np.array(SimResult.from_directory(filename).time_t)
filetag = input('Name of the MATLAB data file : ')
scipy.io.savemat(filetag+".mat",{
    'ctable':concentrations_table,
    'cH':cH,
    'time':time,
    'grid':grid
})