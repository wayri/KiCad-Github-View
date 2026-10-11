package dev.kicadvizdiff.android;

/** Window physical pixels -> inset-owned WebView physical pixels. Zero-width folds are valid. */
final class FoldGeometry {
    static double[] project(boolean vertical, double left, double top, double right, double bottom,
                            double offsetX, double offsetY, double width, double height) {
        for(double n:new double[]{left,top,right,bottom,offsetX,offsetY,width,height})if(!Double.isFinite(n))return null;
        if(width<=0||height<=0||right<left||bottom<top)return null;
        left-=offsetX;right-=offsetX;top-=offsetY;bottom-=offsetY;
        if(vertical ? right<=0||left>=width||bottom<=0||top>=height : bottom<=0||top>=height||right<=0||left>=width)return null;
        left=Math.max(0,left);top=Math.max(0,top);right=Math.min(width,right);bottom=Math.min(height,bottom);
        if(vertical ? bottom<=top : right<=left)return null;
        return new double[]{left,top,right-left,bottom-top};
    }
}
