// frontend/src/components/ui/BackButton.tsx
import { ArrowLeft } from "lucide-react";
import { Button } from "./Button";
import { useNavigate } from "react-router-dom";

interface Props {
  id: number;
  getBackProps: (navigate: any, id: number) => { onClick: () => void };
  className?: string;
}

export const BackButton = ({ id, getBackProps, className }: Props) => {
  const navigate = useNavigate();
  return (
    <Button 
      variant="1c" 
      icon={<ArrowLeft size={16} />} 
      className={className} 
      {...getBackProps(navigate, id)} 
    />
  );
};