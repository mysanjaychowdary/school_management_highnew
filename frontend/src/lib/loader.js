/**
 * Global request loader. Tracks in-flight axios calls via interceptors and
 * dispatches a CustomEvent('app-loader-change') whenever the pending count changes.
 * Mount <GlobalLoader /> in Layout to render the indicator.
 */
import axios from 'axios';

let pending = 0;

const emit = () => {
  window.dispatchEvent(new CustomEvent('app-loader-change', { detail: { pending } }));
};

axios.interceptors.request.use(
  (config) => {
    pending += 1;
    emit();
    return config;
  },
  (error) => {
    pending = Math.max(0, pending - 1);
    emit();
    return Promise.reject(error);
  }
);

axios.interceptors.response.use(
  (response) => {
    pending = Math.max(0, pending - 1);
    emit();
    return response;
  },
  (error) => {
    pending = Math.max(0, pending - 1);
    emit();
    return Promise.reject(error);
  }
);

export const getPending = () => pending;
