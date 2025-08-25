import React, { createContext, useContext, useRef, useState, ReactNode, ComponentType } from "react";
import { useTheme } from "@react-navigation/native";
import { BottomSheetModal, BottomSheetModalProvider, BottomSheetView } from "@gorhom/bottom-sheet";

export interface BottomSheetOptions {
  snapPoints?: string[];
  enableDynamicSizing?: boolean;
}

interface DynamicBottomSheetContextType {
  openBottomSheet: (content: ComponentType<any> | ReactNode, options?: BottomSheetOptions) => void;
  closeBottomSheet: () => void;
  isOpen: boolean;
}

const DynamicBottomSheetContext = createContext<DynamicBottomSheetContextType | undefined>(undefined);

interface DynamicBottomSheetProviderProps {
  children: ReactNode;
}

export function DynamicBottomSheetProvider({ children }: DynamicBottomSheetProviderProps) {
  const theme = useTheme();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [modalContent, setModalContent] = useState<ReactNode>(null);
  const [modalOptions, setModalOptions] = useState<BottomSheetOptions>({});

  const openBottomSheet = (content: ComponentType<any> | ReactNode, options: BottomSheetOptions = {}) => {
    const resolvedContent =
      typeof content === "function" ? React.createElement(content as ComponentType<any>) : content;

    setModalContent(resolvedContent);
    setModalOptions(options);
    if (bottomSheetModalRef.current) {
      setIsOpen(true);
      bottomSheetModalRef.current.present();
    }
  };

  const closeBottomSheet = () => {
    if (bottomSheetModalRef.current) {
      bottomSheetModalRef.current.dismiss();
      setIsOpen(false);
    }
  };

  const handleDismiss = () => {
    setIsOpen(false);
    setModalContent(null);
    setModalOptions({});
  };

  const contextValue: DynamicBottomSheetContextType = {
    openBottomSheet,
    closeBottomSheet,
    isOpen,
  };

  return (
    <BottomSheetModalProvider>
      <DynamicBottomSheetContext.Provider value={contextValue}>
        {children}
        <BottomSheetModal
          ref={bottomSheetModalRef}
          snapPoints={modalOptions.snapPoints}
          enableDynamicSizing={modalOptions.enableDynamicSizing}
          handleIndicatorStyle={{ backgroundColor: theme.colors.primary }}
          backgroundStyle={{ backgroundColor: theme.colors.card }}
          onDismiss={handleDismiss}
        >
          <BottomSheetView
            style={{
              flex: 1,
              paddingBottom: 50,
              alignItems: "center",
            }}
          >
            {modalContent}
          </BottomSheetView>
        </BottomSheetModal>
      </DynamicBottomSheetContext.Provider>
    </BottomSheetModalProvider>
  );
}

export function useDynamicBottomSheet(): DynamicBottomSheetContextType {
  const context = useContext(DynamicBottomSheetContext);
  if (context === undefined) {
    throw new Error("useDynamicBottomSheet must be used within a DynamicBottomSheetProvider");
  }
  return context;
}
