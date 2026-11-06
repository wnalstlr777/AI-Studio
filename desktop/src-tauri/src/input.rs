use std::sync::{Arc, Mutex};

#[derive(Clone, Default)]
pub struct HitMap { pub pixels: Arc<Vec<u8>>, pub width: usize, pub height: usize }

// The returned snapshot owns its pixels. Never keep a mutex guard across window dispatch.
pub fn snapshot(source: &Mutex<HitMap>) -> HitMap {
    source.lock().unwrap_or_else(|p| p.into_inner()).clone()
}
impl HitMap {
    pub fn opaque(&self, x:f64, y:f64, width:u32, height:u32) -> bool {
        if !x.is_finite() || !y.is_finite() || width==0 || height==0 || x<0. || y<0. || x>=width as f64 || y>=height as f64 {return false;}
        let px=(x/width as f64*self.width as f64).floor() as usize;
        let py=(y/height as f64*self.height as f64).floor() as usize;
        self.pixels.get(py*self.width+px).copied().unwrap_or(0)>0
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn dispatch_snapshot_does_not_keep_the_update_lock() {
        let source=Mutex::new(HitMap{pixels:Arc::new(vec![1,0,0,1]),width:2,height:2});
        for _ in 0..2000 {
            let map=snapshot(&source);
            // A window callback can update the mask while the worker uses the snapshot.
            let mut update=source.try_lock().expect("window dispatch must not hold mask lock");
            update.pixels=Arc::new(vec![0,1,1,0]);
            assert_eq!(map.width,2);
        }
    }
    #[test]
    fn alpha_and_dpi_mapping_survive_repeated_updates() {
        let map=HitMap{pixels:Arc::new(vec![1,0,0,1]),width:2,height:2};
        for scale in [1,2,3] {
            assert!(map.opaque(10.*scale as f64,10.*scale as f64,100*scale,100*scale));
            assert!(!map.opaque(80.*scale as f64,10.*scale as f64,100*scale,100*scale));
        }
        assert!(!map.opaque(-1.,0.,100,100));assert!(!map.opaque(100.,0.,100,100));
        assert!(!map.opaque(f64::NAN,0.,100,100));
    }
}
