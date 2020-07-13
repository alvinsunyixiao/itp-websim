import tensorflow as tf

F = 96500.      # Faraday constant [C/mol]
R = 8.314       # Gas constant [J/(mol K)]
T = 298         # Room Temperature [K]
uH = 362e-9     # mobility of H+ ions
uOH = 205e-9    # mobility of OH- ions

class SpressoTF(tf.Module):
    """ Tensorflow implementation of Spresso simulation step """
    def __init__(self):
        super(SpressoTF, self).__init__()
