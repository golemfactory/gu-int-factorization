#[macro_use]
extern crate log;
extern crate env_logger;
extern crate clap;
extern crate num_cpus;

use std::cmp;
use std::thread;

fn main() {
//    use std::env;
//    if env::var("RUST_LOG").is_err() {
//        env::set_var("RUST_LOG", "warn")
//    }
    env_logger::init();

    use clap::{App, Arg};
    let m = App::new("Integer Factorization")
        .about("Factors given integer using all available CPU cores")
        .arg(Arg::with_name("number").index(1).required(true))
        .arg(Arg::with_name("from").index(2))
        .arg(Arg::with_name("to").index(3))
        .get_matches();

    let n = into(m.value_of("number").unwrap());
    let from = into(m.value_of("from").unwrap_or("1"));
    let to = m.value_of("to").map(self::into).unwrap_or(n.clone());
    println!("factors of {} within ({}-{}): {:?}", n, from, to, multithreaded_factor(n.clone(), from.clone(), to.clone()));
}

fn into(s: &str) -> u128 {
    u128::from_str_radix(s, 10).expect("u128 expected")
}

fn factor(n: u128, from: u128, to: u128) -> Vec<u128> {
    debug!("looking for factors of {} within ({}-{})", n, from, to);
    let mut factors: Vec<u128> = Vec::new(); // creates a new vector for the factors of the number
    let mut i = from.clone();
    let to = cmp::min(n.clone(), to);
    while &i <= &to {
        if &n % &i == 0 {
            info!("factor found: {}", i);
            factors.push(i.clone());
        }

        if &i % 1000000 == 0 {
            debug!("i={}", &i);
        }
        i += 1;
    }
    //factors.sort(); // sorts the factors into numerical order for viewing purposes
    factors // returns the factors
}

fn multithreaded_factor(n: u128, from: u128, to: u128) -> Vec<u128> {
    // TODO: edge cases
    let workers_cnt = num_cpus::get() as u128;
    info!("using {} threads", workers_cnt);

    let to = cmp::min(n.clone(), to);
    let step = (to - from.clone()) / workers_cnt + 1;
    let mut from = from;
    let mut to = from.clone() + step.clone();

    let mut factors: Vec<u128> = Vec::new(); // creates a new vector for the factors of the number
    let mut workers = Vec::new();
    for _i in 0..workers_cnt {
        let nc = n.clone();
        let fromc = from.clone();
        let toc = to.clone();
        workers.push(thread::spawn(move || {
            factor(nc, fromc, toc)
        }));
        from = to.clone() + 1;
        to += step.clone();
    }
    for worker in workers {
        let result = worker.join().expect("waiting for worker");
        factors.extend(result.into_iter());
    }
    factors
}


#[cfg(test)]
mod tests {
    use super::{factor, into, multithreaded_factor};

    #[test]
    fn test_single_thread() {
        assert_eq!(factor(into("111"), into("1"), into("111")),
                   vec!(into("1"), into("3"), into("37"), into("111"))
        );
    }

    #[test]
    fn test_multi_thread() {
        assert_eq!(multithreaded_factor(into("111"), into("1"), into("111")),
                   vec!(into("1"), into("3"), into("37"), into("111"))
        );
    }
}
