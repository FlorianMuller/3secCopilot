import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:photo_manager/photo_manager.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  // This widget is the root of your application.
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Flutter Demo',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.teal),
      ),
      home: const MyHomePage(title: 'Flutter Demo Home Page'),
    );
  }
}

class MyHomePage extends StatefulWidget {
  const MyHomePage({super.key, required this.title});

  final String title;

  @override
  State<MyHomePage> createState() => _MyHomePageState();
}

class _MyHomePageState extends State<MyHomePage> {
  List<AssetEntity> _latestPhotos = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _fetchLatestPhotos();
  }

  Future<void> _fetchLatestPhotos() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final PermissionState ps = await PhotoManager.requestPermissionExtend();
    if (!ps.isAuth) {
      setState(() {
        _error = 'Permission denied';
        _loading = false;
      });
      return;
    }
    List<AssetPathEntity> albums = await PhotoManager.getAssetPathList(
      type: RequestType.video,
      onlyAll: true,
    );
    if (albums.isEmpty) {
      setState(() {
        _error = 'No albums found';
        _loading = false;
      });
      return;
    }
    List<AssetEntity> photos = await albums[0].getAssetListPaged(page: 0, size: 5);
    setState(() {
      _latestPhotos = photos;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Theme.of(context).colorScheme.inversePrimary,
        title: Text(widget.title),
      ),
      body: Center(
        child: _loading
            ? const CircularProgressIndicator()
            : _error != null
                ? Text(_error!)
                : _latestPhotos.isEmpty
                    ? const Text('No photos found.')
                    : GridView.builder(
                        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 2,
                          crossAxisSpacing: 8,
                          mainAxisSpacing: 8,
                        ),
                        padding: const EdgeInsets.all(16),
                        itemCount: _latestPhotos.length,
                        itemBuilder: (context, index) {
                          return FutureBuilder<Uint8List?>(
                            future: _latestPhotos[index].thumbnailDataWithSize(const ThumbnailSize(200, 200)),
                            builder: (context, snapshot) {
                              if (!snapshot.hasData) {
                                return const Center(child: CircularProgressIndicator());
                              }
                              final bytes = snapshot.data;
                              if (bytes == null) {
                                return const Center(child: Text('Error loading image'));
                              }
                              return ClipRRect(
                                borderRadius: BorderRadius.circular(12),
                                child: Image.memory(bytes, fit: BoxFit.cover),
                              );
                            },
                          );
                        },
                      ),
      ),
    );
  }
}
