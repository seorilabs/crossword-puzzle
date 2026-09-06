import React, { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { UpdateGateState } from '../../packages/crossword-core/src';
import { subscribeToUpdateGateState } from './platformAuth';

type GateView = {
  message: string;
  updateUrl?: string;
  dismissible: boolean;
};

// SDK의 `@seorilabs/platform-sdk/gate-dom`은 DOM 전용이라 RN 번들러에 import하면
// 깨진다. RN은 `UpdateGateState` 판정 결과로 자기 화면을 직접 그린다(SDK 안내).
function toGateView(state: UpdateGateState): GateView | null {
  switch (state.kind) {
    case 'ok':
      return null;
    case 'recommended':
      return {
        message: state.message,
        updateUrl: state.updateUrl,
        dismissible: true,
      };
    case 'required':
      return {
        message: state.message,
        updateUrl: state.updateUrl,
        dismissible: false,
      };
    case 'maintenance':
      return { message: state.message, dismissible: false };
  }
}

export function UpdateGateOverlay(): React.JSX.Element | null {
  const [state, setState] = useState<UpdateGateState | null>(null);

  useEffect(() => subscribeToUpdateGateState(setState), []);

  if (state == null) {
    return null;
  }
  const view = toGateView(state);
  if (view == null) {
    return null;
  }

  const handleLater = () => setState(null);
  const handleUpdate = () => {
    if (view.updateUrl) {
      Linking.openURL(view.updateUrl).catch(() => {});
    }
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={view.dismissible ? handleLater : () => {}}>
      <View style={styles.backdrop}>
        <View
          style={styles.panel}
          accessibilityRole="alert"
          accessibilityViewIsModal>
          <Text style={styles.message}>{view.message}</Text>
          {view.updateUrl ? (
            <Pressable
              testID="update-gate-update-button"
              accessibilityRole="button"
              style={styles.updateButton}
              onPress={handleUpdate}>
              <Text style={styles.updateButtonText}>업데이트하기</Text>
            </Pressable>
          ) : null}
          {view.dismissible ? (
            <Pressable
              testID="update-gate-later-button"
              accessibilityRole="button"
              style={styles.laterButton}
              onPress={handleLater}>
              <Text style={styles.laterButtonText}>나중에</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  panel: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 16,
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#ffffff',
  },
  message: {
    marginBottom: 20,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    color: '#191f28',
  },
  updateButton: {
    width: '100%',
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 14,
    backgroundColor: '#3182f6',
  },
  updateButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  laterButton: {
    width: '100%',
    alignItems: 'center',
    marginTop: 4,
    paddingVertical: 12,
  },
  laterButtonText: {
    fontSize: 14,
    color: '#8b95a1',
  },
});
