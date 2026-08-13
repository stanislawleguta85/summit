import Feather from '@expo/vector-icons/Feather';
import * as ImageManipulator from 'expo-image-manipulator';
import type { ImagePickerAsset } from 'expo-image-picker';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { adminColors, adminHairline, adminType } from '@/constants/admin-theme';

const MAX_ZOOM = 4;
const OUTPUT_SIZE = 512;

export function AvatarEditor({
  asset,
  onCancel,
  onConfirm,
  saving,
}: {
  asset: ImagePickerAsset | null;
  onCancel: () => void;
  onConfirm: (croppedUri: string) => Promise<void>;
  saving: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const cropSize = Math.min(windowWidth - 48, 320);
  const [processing, setProcessing] = useState(false);
  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);
  const zoom = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startZoom = useSharedValue(1);

  const sourceWidth = Math.max(1, asset?.width ?? 1);
  const sourceHeight = Math.max(1, asset?.height ?? 1);
  const coverScale = Math.max(cropSize / sourceWidth, cropSize / sourceHeight);
  const baseWidth = sourceWidth * coverScale;
  const baseHeight = sourceHeight * coverScale;

  useEffect(() => {
    offsetX.value = 0;
    offsetY.value = 0;
    zoom.value = 1;
  }, [asset?.uri, offsetX, offsetY, zoom]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          startX.value = offsetX.value;
          startY.value = offsetY.value;
        })
        .onUpdate((event) => {
          const scaledWidth = baseWidth * zoom.value;
          const scaledHeight = baseHeight * zoom.value;
          const maxX = Math.max(0, (scaledWidth - cropSize) / 2);
          const maxY = Math.max(0, (scaledHeight - cropSize) / 2);
          offsetX.value = clampWorklet(startX.value + event.translationX, -maxX, maxX);
          offsetY.value = clampWorklet(startY.value + event.translationY, -maxY, maxY);
        }),
    [baseHeight, baseWidth, cropSize, offsetX, offsetY, startX, startY, zoom]
  );

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onBegin(() => {
          startZoom.value = zoom.value;
        })
        .onUpdate((event) => {
          const nextZoom = clampWorklet(startZoom.value * event.scale, 1, MAX_ZOOM);
          const maxX = Math.max(0, (baseWidth * nextZoom - cropSize) / 2);
          const maxY = Math.max(0, (baseHeight * nextZoom - cropSize) / 2);
          zoom.value = nextZoom;
          offsetX.value = clampWorklet(offsetX.value, -maxX, maxX);
          offsetY.value = clampWorklet(offsetY.value, -maxY, maxY);
        }),
    [baseHeight, baseWidth, cropSize, offsetX, offsetY, startZoom, zoom]
  );

  const composedGesture = useMemo(
    () => Gesture.Simultaneous(panGesture, pinchGesture),
    [panGesture, pinchGesture]
  );

  const imageStyle = useAnimatedStyle(() => ({
    height: baseHeight * zoom.value,
    left: (cropSize - baseWidth * zoom.value) / 2 + offsetX.value,
    position: 'absolute',
    top: (cropSize - baseHeight * zoom.value) / 2 + offsetY.value,
    width: baseWidth * zoom.value,
  }));

  if (!asset) return null;

  const adjustZoom = (difference: number) => {
    const nextZoom = Math.min(MAX_ZOOM, Math.max(1, zoom.value + difference));
    const maxX = Math.max(0, (baseWidth * nextZoom - cropSize) / 2);
    const maxY = Math.max(0, (baseHeight * nextZoom - cropSize) / 2);
    offsetX.value = withTiming(Math.min(maxX, Math.max(-maxX, offsetX.value)));
    offsetY.value = withTiming(Math.min(maxY, Math.max(-maxY, offsetY.value)));
    zoom.value = withTiming(nextZoom);
  };

  const cropAndConfirm = async () => {
    if (processing || saving) return;
    setProcessing(true);
    try {
      const currentZoom = zoom.value;
      const renderedScale = coverScale * currentZoom;
      const renderedWidth = sourceWidth * renderedScale;
      const renderedHeight = sourceHeight * renderedScale;
      const imageLeft = (cropSize - renderedWidth) / 2 + offsetX.value;
      const imageTop = (cropSize - renderedHeight) / 2 + offsetY.value;
      const cropWidth = Math.min(sourceWidth, cropSize / renderedScale);
      const cropHeight = Math.min(sourceHeight, cropSize / renderedScale);
      const originX = Math.min(
        sourceWidth - cropWidth,
        Math.max(0, -imageLeft / renderedScale)
      );
      const originY = Math.min(
        sourceHeight - cropHeight,
        Math.max(0, -imageTop / renderedScale)
      );

      const context = ImageManipulator.ImageManipulator.manipulate(asset.uri);
      context
        .crop({
          height: Math.max(1, Math.round(cropHeight)),
          originX: Math.max(0, Math.round(originX)),
          originY: Math.max(0, Math.round(originY)),
          width: Math.max(1, Math.round(cropWidth)),
        })
        .resize({ height: OUTPUT_SIZE, width: OUTPUT_SIZE });
      const renderedImage = await context.renderAsync();
      const result = await renderedImage.saveAsync({
        compress: 0.86,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      await onConfirm(result.uri);
    } finally {
      setProcessing(false);
    }
  };

  const busy = processing || saving;

  return (
    <Modal animationType="slide" onRequestClose={onCancel} visible>
      <View
        style={[
          styles.screen,
          { paddingBottom: Math.max(insets.bottom, 20), paddingTop: Math.max(insets.top, 20) },
        ]}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Cancelar"
            disabled={busy}
            onPress={onCancel}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
            <Feather color={adminColors.textPrimary} name="x" size={20} />
          </Pressable>
          <Text style={styles.title}>Ajustar foto</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.editorArea}>
          <GestureDetector gesture={composedGesture}>
            <View
              style={[
                styles.cropCircle,
                { borderRadius: cropSize / 2, height: cropSize, width: cropSize },
              ]}>
              <Animated.Image
                resizeMode="cover"
                source={{ uri: asset.uri }}
                style={imageStyle}
              />
            </View>
          </GestureDetector>
          <Text style={styles.help}>Arrastra la foto y pellizca para ampliar.</Text>

          <View style={styles.zoomControls}>
            <Pressable
              accessibilityLabel="Reducir"
              disabled={busy}
              onPress={() => adjustZoom(-0.25)}
              style={({ pressed }) => [styles.zoomButton, pressed && styles.pressed]}>
              <Feather color={adminColors.textPrimary} name="minus" size={18} />
            </Pressable>
            <Feather color={adminColors.textMuted} name="zoom-in" size={17} />
            <Pressable
              accessibilityLabel="Ampliar"
              disabled={busy}
              onPress={() => adjustZoom(0.25)}
              style={({ pressed }) => [styles.zoomButton, pressed && styles.pressed]}>
              <Feather color={adminColors.textPrimary} name="plus" size={18} />
            </Pressable>
          </View>
        </View>

        <Pressable
          disabled={busy}
          onPress={() => void cropAndConfirm()}
          style={({ pressed }) => [
            styles.saveButton,
            busy && styles.disabled,
            pressed && styles.pressed,
          ]}>
          {busy ? (
            <ActivityIndicator color={adminColors.amberOn} />
          ) : (
            <Text style={styles.saveButtonText}>Guardar foto</Text>
          )}
        </Pressable>
      </View>
    </Modal>
  );
}

function clampWorklet(value: number, minimum: number, maximum: number) {
  'worklet';
  return Math.min(maximum, Math.max(minimum, value));
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: adminColors.bgPage,
    flex: 1,
    paddingHorizontal: 24,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  iconButton: {
    alignItems: 'center',
    borderColor: adminColors.borderStrong,
    borderRadius: 18,
    borderWidth: adminHairline,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  headerSpacer: {
    width: 36,
  },
  title: {
    ...adminType.section,
  },
  editorArea: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  cropCircle: {
    backgroundColor: adminColors.bgCardMuted,
    borderColor: adminColors.amber,
    borderWidth: 3,
    overflow: 'hidden',
  },
  help: {
    ...adminType.secondary,
    marginTop: 22,
    textAlign: 'center',
  },
  zoomControls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 18,
    marginTop: 18,
  },
  zoomButton: {
    alignItems: 'center',
    borderColor: adminColors.borderStrong,
    borderRadius: 20,
    borderWidth: adminHairline,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: adminColors.amber,
    borderRadius: 10,
    minHeight: 48,
    justifyContent: 'center',
  },
  saveButtonText: {
    color: adminColors.amberOn,
    fontSize: 14,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.72,
  },
});
