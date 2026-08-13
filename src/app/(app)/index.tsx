import { AdminHomeScreen } from '@/components/admin/admin-home-screen';
import { CustomerHomeScreen } from '@/components/customer-home-screen';
import { useAuth } from '@/context/auth-context';

export default function HomeScreen() {
  const { hasRole } = useAuth();

  if (hasRole('owner') || hasRole('trainer')) {
    return <AdminHomeScreen />;
  }

  return <CustomerHomeScreen />;
}
