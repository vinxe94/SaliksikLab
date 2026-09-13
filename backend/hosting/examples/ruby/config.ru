run lambda { |_env|
  [200, { "content-type" => "text/html; charset=utf-8" },
   ["<!doctype html><html><head><title>Ruby preview</title></head><body><h1>Ruby hosting works!</h1></body></html>"]]
}
