package dev.kicadvizdiff.android;

import android.app.Activity;
import android.os.Bundle;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Button;

/** Foreground retention avoids broadcast time limits for large copies. Never accepts external intents. */
public final class KeepTemporaryProjectActivity extends Activity {
    private Thread worker;
    @Override public void onCreate(Bundle saved){super.onCreate(saved);
        String id=getIntent().getStringExtra("temporaryId");if(id==null||!id.matches("[a-f0-9]{32}")){finish();return;}
        LinearLayout panel=new LinearLayout(this);panel.setOrientation(LinearLayout.VERTICAL);int padding=(int)(24*getResources().getDisplayMetrics().density);panel.setPadding(padding,padding,padding,padding);
        TextView status=new TextView(this);status.setText("Keeping project offline…\nYour temporary copy stays safe while it is copied.");status.setTextSize(18);panel.addView(status);
        ProgressBar progress=new ProgressBar(this);panel.addView(progress);setContentView(panel);
        worker=new Thread(()->{String failure=null;try{new ProjectLibrary(this).keepTemporary(id);}catch(Exception error){failure="Could not keep this project. It may have expired or storage may be full. Your original copy was not changed.";}
            final String message=failure;runOnUiThread(()->{if(isDestroyed()||isFinishing())return;progress.setVisibility(android.view.View.GONE);status.setText(message==null?"Project saved offline in Your projects.":message);Button close=new Button(this);close.setText("Close");close.setOnClickListener(view->finish());panel.addView(close);});},"keep-temporary-project");worker.start();
    }
    @Override public void onDestroy(){if(worker!=null&&isFinishing())worker.interrupt();super.onDestroy();}
}
