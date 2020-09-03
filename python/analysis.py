import numpy as np
from utils import SimResult
import cv2
import matplotlib.pyplot as plt

class GeneralStat:
    def __init__(self, result_file_path):
        self.sim_result = SimResult.from_file(result_file_path)

    def find_stat(self,species_name):
        allspecies_names = [sp['name'] for sp in self.sim_result.inputs['species']]
        try:
            species_idx = allspecies_names.index(species_name)
        except ValueError:
            raise ValueError(
                f'Species {species_name} NOT found, please choose from {allspecies_names}')
        cmat_final_n = self.sim_result.concentration_tsn[-1,species_idx]
        cmat_initial_n = self.sim_result.concentration_tsn[0,species_idx]
        concentration_max = max(cmat_final_n)
        p = cmat_final_n / (concentration_max)
        x = np.linspace(0,self.sim_result.inputs['domainLen'],self.sim_result.inputs['numGrids'])
        miu = np.sum(p*x)
        std = np.sqrt(np.sum(p * (x-miu)**2))
        skewness = np.sum(p*((x-miu)/std)**3)
        travelled_LE = self._find_max_deri_pos(cmat_final_n) - self._find_max_deri_pos(cmat_initial_n)
        return {
            'max value':concentration_max,
            'std': std,
            'mean':miu,
            'skewness':skewness,
            'distance travelled by LE':travelled_LE

        }
    def _find_min_deri_pos(self,cmat_n):
        cmat_n_deri = np.gradient(cmat_n)
        min_deri_pos = np.argmin(cmat_n_deri) * self.sim_result.inputs['domainLen']/self.sim_result.inputs['numGrids']
        return min_deri_pos

    def _find_max_deri_pos(self,cmat_n):
        cmat_n_deri = np.gradient(cmat_n)
        max_deri_pos = np.argmax(cmat_n_deri) * self.sim_result.inputs['domainLen']/self.sim_result.inputs['numGrids']
        return max_deri_pos


class DNA_Analysis(GeneralStat):
    def __init__(self,result_file_path):
        super(DNA_Analysis,self).__init__(result_file_path)

    def find_nondime_fom(self,win_pos,win_width,DNA_name,imp_name):

        concentration_tsn = self.sim_result.concentration_tsn
        i_win = self._calculate_time_idx(win_pos,DNA_name)

        allspecies_names = [sp['name'] for sp in self.sim_result.inputs['species']]
        try:
            DNA_idx = allspecies_names.index(DNA_name)
        except ValueError:
            raise ValueError(
                f'DNA {species_name} NOT found, please choose from {allspecies_names}')
        try:
            imp_idx = allspecies_names.index(imp_name)
        except ValueError:
            raise ValueError(
                f'impurity {species_name} NOT found, please choose from {allspecies_names}')

        length_per_grid = self.sim_result.inputs['domainLen'] / self.sim_result.inputs['numGrids']
        grid_per_length = self.sim_result.inputs['numGrids'] / self.sim_result.inputs['domainLen']

        cmat_win_dna_n = concentration_tsn[i_win,DNA_idx]
        cmat_win_imp_n = concentration_tsn[i_win,imp_idx]

        cmat_win_dna_n_slice = cmat_win_dna_n[int((win_pos - win_width/2)* grid_per_length):int((win_pos + win_width/2)* grid_per_length)]
        cmat_win_imp_n_slice = cmat_win_imp_n[int((win_pos - win_width/2)* grid_per_length) :int((win_pos + win_width/2)* grid_per_length)]
        #Limp* = Limp / window width
        Limp = (win_pos - win_width/2) - self._find_min_deri_pos(cmat_win_imp_n)
        Limp_star = Limp/win_width

        #alpha = dna inside window / dna total
        dna_inwindow = np.sum(cmat_win_dna_n_slice) * length_per_grid
        dna_total = np.sum(cmat_win_dna_n) * length_per_grid
        alpha = dna_inwindow/dna_total

        #beta = imp inside window / imp total
        imp_inwindow = np.sum(cmat_win_imp_n_slice) * length_per_grid
        imp_total = np.sum(cmat_win_imp_n) * length_per_grid
        beta = imp_inwindow/imp_total

        #gamma = Linj / (Linj + Ls + Lw)
        imp_inj_left = self.sim_result.inputs['species'][imp_idx]['injectionLoc'] - 1/2 * self.sim_result.inputs['species'][imp_idx]['injectionWidth']
        imp_inj_right = self.sim_result.inputs['species'][imp_idx]['injectionLoc'] + 1/2 * self.sim_result.inputs['species'][imp_idx]['injectionWidth']
        dna_inj_left = self.sim_result.inputs['species'][DNA_idx]['injectionLoc'] - 1/2 * self.sim_result.inputs['species'][DNA_idx]['injectionWidth']
        dna_inj_right = self.sim_result.inputs['species'][DNA_idx]['injectionLoc'] + 1/2 * self.sim_result.inputs['species'][DNA_idx]['injectionWidth']

        Linj_left = min(imp_inj_left,dna_inj_left)
        Linj_right = max(imp_inj_right,dna_inj_right)
        Linj = Linj_right-Linj_left
        Ltotal = win_pos + 1/2 * win_width - Linj_left
        gamma = Linj / Ltotal
        return {
        'Limp*': Limp_star,
        'alpha' : alpha,
        'beta' : beta,
        'gamma' : gamma
        }

    def _calculate_time_idx(self,win_pos,species_name):
        concentration_tsn = self.sim_result.concentration_tsn
        length_per_grid = self.sim_result.inputs['domainLen'] / self.sim_result.inputs['numGrids']
        grid_per_length = self.sim_result.inputs['numGrids'] / self.sim_result.inputs['domainLen']

        allspecies_names = [sp['name'] for sp in self.sim_result.inputs['species']]
        try:
            species_idx = allspecies_names.index(species_name)
        except ValueError:
            raise ValueError(
                f'Species {species_name} NOT found, please choose from {allspecies_names}')
        i_win = None
        for i,concentration_sn in enumerate(concentration_tsn):
            if np.argmax(concentration_sn[species_idx]) * length_per_grid >= win_pos:
                i_win = i
                break
        return i_win

class SpatialTemporal(GeneralStat):
    def __init__(self,result_file_path):
        super(SpatialTemporal,self).__init__(result_file_path)

    def concentration(self,species_names):
        concentration_tsn = self.sim_result.concentration_tsn
        num_species = len(species_names)
        concentration_stn = concentration_tsn.transpose(1,0,2)
        allspecies_names = [sp['name'] for sp in self.sim_result.inputs['species']]

        index_list = []
        colormap_qtn3 = np.zeros((len(species_names),concentration_tsn.shape[0],concentration_tsn.shape[2],3))
        for i,name in enumerate(species_names):
            try:
                species_idx = allspecies_names.index(name)
            except ValueError:
                raise ValueError(
                    f'Species {name} NOT found, please choose from {allspecies_names}')
            index_list.append(species_idx)

            cmat_tn = concentration_stn[species_idx]
            saturation = 1.0
            hue = 360/num_species * i
            colormap_qtn3[i] = self._single_species_colormap(cmat_tn,hue,saturation)

        concentration_qtn = concentration_stn[index_list]
        concentration_norm_qtn = concentration_qtn/np.max(concentration_qtn,axis=(1,2),keepdims=True)
        weighted_qtn = concentration_norm_qtn/(np.sum(concentration_norm_qtn,axis=0,keepdims=True))

        final_img_tn3 = np.sum(weighted_qtn[...,None] * colormap_qtn3 , axis=0)

        plt.imshow(final_img_tn3,aspect = 'auto')
        plt.gca().invert_yaxis()
        return

    def pH(self):
        cH_tn = self.sim_result.cH_tn
        pH_tn = -np.log10(cH_tn)
        final_img_tn3 = self._single_species_colormap(pH_tn,0,0)

        plt.imshow(final_img_tn3,aspect = 'auto')
        plt.gca().invert_yaxis()
        return

    def _single_species_colormap(self,cmat_tn,hue,saturation):
    # t = time, n = Ngrid
    #hue from 0 to 360 degree, fixed
    #saturation from 0 to 1 (how pure/vivid), fixed
    #lightness 0=black 1=white, depends on local concentration

        hue = hue * np.ones_like(cmat_tn)

        cmin = np.amin(cmat_tn)
        cmax = np.amax(cmat_tn)
        #map to [0,1]
        lightness =  0.9 * (cmat_tn - cmin) / (cmax - cmin)
        #map to [1,0]
        #lightness = 1 -  lightness

        saturation = saturation * np.ones_like(cmat_tn)

        #hls stacked, then convert to rgb
        img_hls = np.dstack((hue,lightness,saturation))
        img_rgb = cv2.cvtColor(img_hls.astype(np.float32),cv2.COLOR_HLS2RGB)
        return img_rgb
