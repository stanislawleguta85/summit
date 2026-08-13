import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { adminColors } from '@/constants/admin-theme';

export function ProfileAvatar({
  firstName,
  imageUrl,
  lastName,
  size = 28,
  staff = false,
}: {
  firstName?: string | null;
  imageUrl?: string | null;
  lastName?: string | null;
  size?: number;
  staff?: boolean;
}) {
  const initials =
    [firstName, lastName]
      .filter(Boolean)
      .map((part) => part?.trim().charAt(0).toUpperCase())
      .join('')
      .slice(0, 2) || '?';

  return (
    <View
      style={[
        styles.avatar,
        staff && styles.avatarStaff,
        { borderRadius: size / 2, height: size, width: size },
      ]}>
      {imageUrl ? (
        <Image
          contentFit="cover"
          source={{ uri: imageUrl }}
          style={[styles.image, { borderRadius: size / 2 }]}
          transition={150}
        />
      ) : (
        <Text style={[styles.initials, { fontSize: Math.max(10, size * 0.36) }]}>
          {initials}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarStaff: {
    backgroundColor: adminColors.amberAvatar,
  },
  image: {
    height: '100%',
    width: '100%',
  },
  initials: {
    color: adminColors.textPrimary,
    fontWeight: '500',
  },
});
