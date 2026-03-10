import { AlertError } from "./alert";

export function ErrorMessage({ message }: { message?: string }) {
  if (!message) {
    return null;
  }
  return <AlertError message={message} />;
}
