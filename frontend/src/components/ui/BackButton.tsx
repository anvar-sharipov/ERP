// frontend/src/components/ui/BackButton.tsx
import { useEffect, useCallback } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "./Button";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { playAside2Sound } from "../../core/utils/sound";

interface Props {
  id: number;
  getBackProps: (navigate: any, id: number) => { onClick: () => void };
  className?: string;
}

export const BackButton = ({ id, getBackProps, className }: Props) => {
  const {t} = useTranslation();
  const navigate = useNavigate();
  const backProps = getBackProps(navigate, id);

  // Оборачиваем функцию в useCallback, чтобы useEffect не пересоздавался
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.altKey && e.key === "ArrowLeft") {
        playAside2Sound();
        e.preventDefault();
        backProps.onClick();
      }
    },
    [backProps],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return <Button title={`${t("Back")} (Alt + ←)`} variant="1c" icon={<ArrowLeft size={16} />} className={className} {...backProps} />;
};

// import { ArrowLeft } from "lucide-react";
// import { Button } from "./Button";
// import { useNavigate } from "react-router-dom";

// interface Props {
//   id: number;
//   getBackProps: (navigate: any, id: number) => { onClick: () => void };
//   className?: string;
// }

// export const BackButton = ({ id, getBackProps, className }: Props) => {
//   const navigate = useNavigate();
//   return (
//     <Button
//       variant="1c"
//       icon={<ArrowLeft size={16} />}
//       className={className}
//       {...getBackProps(navigate, id)}
//     />
//   );
// };
