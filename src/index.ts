import { createStore } from 'zustand/vanilla';

interface State {
  inputText: string;
  outputFileName: string;
  message: string;
}

const initialState: State = {
  inputText: '',
  outputFileName: '',
  message: '',
};

interface Action {
  generateQRCode: (text: string, format: string) => Promise<void>;
}

const store = createStore<State & Action>((set) => ({
  ...initialState,
  generateQRCode: (text, format) => {
    const sanitizedFileName = text.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const outputFileName = `${sanitizedFileName}_qr.${format}`;
    set({ inputText: text, outputFileName });

    return new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        const success = true; // Simulate success
        if (success) {
          set({ message: `File saved successfully! (${outputFileName})` });
          resolve();
        } else {
          reject(new Error('Failed to save file.'));
        }
      }, 1000); // Simulate async operation
    }).catch((error) => {
      set({ message: `An error occurred while generating the QR code: ${error}` });
    });
  },
}));

// Example usage outside of React
store.getState().generateQRCode('exampleText', 'png').then(() => {
  console.log(store.getState().message); // Output: "File saved successfully! (exampletext_qr.png)"
});
