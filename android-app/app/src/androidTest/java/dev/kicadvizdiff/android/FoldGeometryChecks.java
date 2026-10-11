package dev.kicadvizdiff.android;
final class FoldGeometryChecks {
    static int run() {
        int checks=0;
        equal(FoldGeometry.project(true,990,0,1030,2200,30,80,2000,2000),960,0,40,2000);checks++;
        equal(FoldGeometry.project(false,0,1080,2000,1120,0,80,2000,2000),0,1000,2000,40);checks++;
        equal(FoldGeometry.project(true,1000,0,1000,2200,0,80,2000,2000),1000,0,0,2000);checks++;
        equal(FoldGeometry.project(false,0,1000,2000,1000,0,0,2000,2000),0,1000,2000,0);checks++;
        for(double[] invalid:new double[][]{{-100,0,-20,2200},{2020,0,2040,2200},{0,0,0,2200},{2000,0,2000,2200},{40,50,30,2000},{Double.NaN,0,1000,2000}}){if(FoldGeometry.project(true,invalid[0],invalid[1],invalid[2],invalid[3],0,0,2000,2000)!=null)throw new AssertionError("Invalid/outside fold");checks++;}
        if(FoldGeometry.project(false,0,20,2000,40,0,80,2000,2000)!=null)throw new AssertionError("Status bar hinge retained");checks++;
        if(FoldGeometry.project(true,1000,0,1020,2000,0,0,0,2000)!=null)throw new AssertionError("Unlaid viewport retained");checks++;
        // The trusted JS bridge applies independent CSS scaling after this physical projection.
        double[] mapped=FoldGeometry.project(true,990,0,1030,2200,30,80,2000,2000);
        if(mapped[0]*800/2000!=384||mapped[2]*800/2000!=16||mapped[3]*720/2000!=720)throw new AssertionError("CSS viewport scaling");checks++;
        return checks;
    }
    private static void equal(double[] value,double... expected){if(value==null||value.length!=expected.length)throw new AssertionError("Missing hinge");for(int i=0;i<value.length;i++)if(value[i]!=expected[i])throw new AssertionError("Unexpected hinge coordinate "+i);}
}
