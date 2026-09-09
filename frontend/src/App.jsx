import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.jsx';
import { router } from './app/router.jsx';
import { CycleProvider } from './cycles/CycleContext.jsx';
import { CycleGuidelineAcknowledgementGate } from './features/cycles/CycleGuidelineAcknowledgementGate.jsx';

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CycleProvider><CycleGuidelineAcknowledgementGate><RouterProvider router={router} /></CycleGuidelineAcknowledgementGate></CycleProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
