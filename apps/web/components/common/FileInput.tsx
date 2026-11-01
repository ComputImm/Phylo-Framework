export default function FileInput({
  accept,
  multiple,
  onFiles,
  disabled = false,
}: {
  accept?: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}) {
  return (
    <input
      type="file"
      multiple={multiple}
      onChange={(e) => onFiles(Array.from(e.target.files ?? []))}
      className="block w-full max-w-full text-sm file:mr-3 file:rounded-md file:border file:px-3 file:py-1.5 pointer-coarse:file:py-3"
      accept={accept}
      disabled={disabled}
    />
  );
}
