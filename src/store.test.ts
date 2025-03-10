import { createStore } from 'zustand/vanilla';

// Define the store state and actions
interface StoreState {
  message: string;
  setMessage: (newMessage: string) => void;
}

// Create the store with TypeScript types
const newStore = createStore<StoreState>((set) => ({
  message: '',
  setMessage: (newMessage: string) => set({ message: newMessage }),
}));

test('should update message and trigger subscription', () => {
  const store = newStore;
  const callback = jest.fn();

  // Subscribe to changes in the `message` state
  store.subscribe(callback);

  // Update the message
  store.getState().setMessage('Hello, Jest!');

  // Assert the callback was called with the new message
  expect(callback).toHaveBeenCalledWith(
    // New state
    expect.objectContaining({
      message: 'Hello, Jest!',
      setMessage: store.getState().setMessage
    }),
    // Initial state
    expect.objectContaining({
      message: '',
      setMessage: store.getState().setMessage
    }),
  );

  // Assert the state was updated
  expect(store.getState().message).toBe('Hello, Jest!');
});
