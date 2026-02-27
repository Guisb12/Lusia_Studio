"use client";

import { useState, useRef, useCallback } from "react";
import ReactCrop, { type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ImageCropDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    imageSrc: string;
    onCropDone: (blob: Blob) => void;
}

function cropImageToCanvas(
    image: HTMLImageElement,
    crop: PixelCrop,
): HTMLCanvasElement | null {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    canvas.width = crop.width * scaleX;
    canvas.height = crop.height * scaleY;

    ctx.drawImage(
        image,
        crop.x * scaleX,
        crop.y * scaleY,
        crop.width * scaleX,
        crop.height * scaleY,
        0,
        0,
        canvas.width,
        canvas.height,
    );

    return canvas;
}

export function ImageCropDialog({
    open,
    onOpenChange,
    imageSrc,
    onCropDone,
}: ImageCropDialogProps) {
    const [crop, setCrop] = useState<Crop>();
    const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
    const imgRef = useRef<HTMLImageElement>(null);

    const handleConfirm = useCallback(() => {
        if (!completedCrop || !imgRef.current) return;

        const canvas = cropImageToCanvas(imgRef.current, completedCrop);
        if (!canvas) return;

        canvas.toBlob(
            (blob) => {
                if (blob) {
                    onCropDone(blob);
                    onOpenChange(false);
                }
            },
            "image/png",
            1,
        );
    }, [completedCrop, onCropDone, onOpenChange]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Recortar imagem</DialogTitle>
                </DialogHeader>

                <div className="flex justify-center max-h-[60vh] overflow-auto">
                    <ReactCrop
                        crop={crop}
                        onChange={(c) => setCrop(c)}
                        onComplete={(c) => setCompletedCrop(c)}
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            ref={imgRef}
                            src={imageSrc}
                            alt="Imagem para recortar"
                            style={{ maxWidth: "100%", maxHeight: "55vh" }}
                        />
                    </ReactCrop>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancelar
                    </Button>
                    <Button onClick={handleConfirm} disabled={!completedCrop}>
                        Recortar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
